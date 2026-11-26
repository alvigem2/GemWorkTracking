BEGIN;

DO $check$
BEGIN
  IF current_user <> 'postgres'
    OR to_regprocedure('gemwork_bk03506.lock_writes()') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_trigger
      WHERE tgrelid='public.documentos'::regclass AND tgname='gw03506_lock')
  THEN
    RAISE EXCEPTION 'Se requiere el backend consolidado y el rol postgres';
  END IF;
END;
$check$;

ALTER TABLE public.documentos ADD COLUMN tarea_id uuid REFERENCES public.tareas(id);
CREATE INDEX documentos_tarea_id_idx ON public.documentos(tarea_id) WHERE tarea_id IS NOT NULL;

CREATE TABLE gemwork_bk03506.evidence_write (
  transaction_id xid8 PRIMARY KEY,
  operation text NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE'))
);
REVOKE ALL ON TABLE gemwork_bk03506.evidence_write FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.fn_puede_gestionar_evidencia(p_tarea_id uuid,p_proyecto_id uuid,p_autor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tareas t
    JOIN public.etapas e ON e.id=t.etapa_id
    JOIN public.tarea_desarrollador a ON a.tarea_id=t.id
    JOIN gemwork_bk03506.active_actor() u ON u.id=a.desarrollador_id
    WHERE t.id=p_tarea_id AND e.proyecto_id=p_proyecto_id AND u.id=p_autor_id
      AND u.rol='Desarrollador'
  );
$$;

CREATE FUNCTION gemwork_bk03506.guard_document_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM gemwork_bk03506.lock_writes();
  IF TG_OP='TRUNCATE' THEN
    RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='TRUNCATE no forma parte del flujo GemWork';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM gemwork_bk03506.active_actor() a WHERE a.rol='Administrador'
  ) THEN
    DELETE FROM gemwork_bk03506.evidence_write a
    WHERE a.transaction_id=pg_current_xact_id() AND a.operation=TG_OP;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Usa la operación autorizada de documentos';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER gw03506_lock ON public.documentos;
CREATE TRIGGER gw03506_lock BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.documentos
FOR EACH STATEMENT EXECUTE FUNCTION gemwork_bk03506.guard_document_write();

CREATE POLICY documentos_evidencia_borrador_select ON public.documentos
FOR SELECT TO authenticated USING (
  public.fn_puede_gestionar_evidencia(tarea_id,proyecto_id,subido_por)
  AND estado_documento_id IN (SELECT id FROM public.estado_documento WHERE nombre='Borrador')
);

-- El bloqueo de fila coordina la carga con publicar o descartar el borrador.
CREATE FUNCTION public.fn_puede_subir_evidencia(p_ruta text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.documentos d JOIN public.estado_documento s ON s.id=d.estado_documento_id
  WHERE d.ruta_storage=p_ruta AND d.ruta_storage=d.proyecto_id::text || '/' || d.id::text || '.pdf'
    AND s.nombre='Borrador' AND public.fn_puede_gestionar_evidencia(d.tarea_id,d.proyecto_id,d.subido_por)
  FOR KEY SHARE OF d;
  RETURN FOUND;
END;
$$;

CREATE POLICY documentos_evidencia_storage_insert ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id='documentos' AND public.fn_puede_subir_evidencia(objects.name)
);

CREATE POLICY documentos_evidencia_storage_select ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id='documentos' AND EXISTS (
    SELECT 1 FROM public.documentos d JOIN public.estado_documento s ON s.id=d.estado_documento_id
    WHERE d.ruta_storage=objects.name AND s.nombre='Borrador'
      AND public.fn_puede_gestionar_evidencia(d.tarea_id,d.proyecto_id,d.subido_por)
  )
);

CREATE FUNCTION public.fn_preparar_evidencia_tarea(
  p_tarea_id uuid,p_documento_id uuid,p_nombre text,p_descripcion text,p_archivo text,p_bytes bigint
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_proyecto uuid;
  v_autor uuid;
  v_borrador uuid;
  v_cliente uuid;
  v_ruta text;
BEGIN
  PERFORM gemwork_bk03506.lock_writes();
  SELECT a.id INTO v_autor FROM gemwork_bk03506.active_actor() a WHERE a.rol='Desarrollador';
  SELECT e.proyecto_id INTO v_proyecto FROM public.tareas t JOIN public.etapas e ON e.id=t.etapa_id
    WHERE t.id=p_tarea_id;
  IF NOT public.fn_puede_gestionar_evidencia(p_tarea_id,v_proyecto,v_autor) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Solo el desarrollador activo asignado puede subir evidencia';
  END IF;
  IF p_documento_id IS NULL OR p_nombre IS NULL OR length(btrim(p_nombre)) NOT BETWEEN 1 AND 180
    OR p_archivo IS NULL OR length(p_archivo)>255 OR lower(right(p_archivo,4))<>'.pdf'
    OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 20971520 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Datos de PDF inválidos';
  END IF;
  SELECT id INTO STRICT v_borrador FROM public.estado_documento WHERE nombre='Borrador';
  SELECT id INTO STRICT v_cliente FROM public.alcance_documento WHERE nombre='Cliente';
  v_ruta := v_proyecto::text || '/' || p_documento_id::text || '.pdf';
  INSERT INTO gemwork_bk03506.evidence_write VALUES (pg_current_xact_id(),'INSERT');
  INSERT INTO public.documentos
    (id,proyecto_id,tarea_id,estado_documento_id,alcance_documento_id,nombre,descripcion,
     nombre_archivo,ruta_storage,extension,tamano_bytes,subido_por)
  VALUES (p_documento_id,v_proyecto,p_tarea_id,v_borrador,v_cliente,btrim(p_nombre),
     nullif(btrim(p_descripcion),''),p_archivo,v_ruta,'pdf',p_bytes,v_autor);
  RETURN v_ruta;
END;
$$;

CREATE FUNCTION public.fn_publicar_evidencia_tarea(p_documento_id uuid,p_descartar boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_doc public.documentos%ROWTYPE;
  v_estado text;
  v_publicado uuid;
  v_pdf boolean;
BEGIN
  PERFORM gemwork_bk03506.lock_writes();
  IF p_descartar IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Operación de evidencia inválida';
  END IF;
  SELECT d.* INTO v_doc FROM public.documentos d WHERE d.id=p_documento_id FOR UPDATE;
  IF NOT FOUND OR NOT public.fn_puede_gestionar_evidencia(v_doc.tarea_id,v_doc.proyecto_id,v_doc.subido_por) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Solo el desarrollador activo asignado puede gestionar su evidencia';
  END IF;
  SELECT nombre INTO STRICT v_estado FROM public.estado_documento WHERE id=v_doc.estado_documento_id;
  IF NOT p_descartar AND v_estado='Publicado' AND v_doc.publicado_por=v_doc.subido_por THEN RETURN v_doc.id; END IF;
  IF v_estado<>'Borrador' OR NOT EXISTS (
    SELECT 1 FROM public.alcance_documento a WHERE a.id=v_doc.alcance_documento_id AND a.nombre='Cliente'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='La evidencia debe ser un borrador con alcance Cliente';
  END IF;
  SELECT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='documentos' AND o.name=v_doc.ruta_storage)
    INTO v_pdf;
  IF p_descartar AND NOT v_pdf THEN
    INSERT INTO gemwork_bk03506.evidence_write VALUES (pg_current_xact_id(),'DELETE');
    DELETE FROM public.documentos WHERE id=v_doc.id;
    RETURN v_doc.id;
  END IF;
  IF p_descartar OR NOT v_pdf THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='El estado del PDF en Storage no permite la operación';
  END IF;
  SELECT id INTO STRICT v_publicado FROM public.estado_documento WHERE nombre='Publicado';
  INSERT INTO gemwork_bk03506.evidence_write VALUES (pg_current_xact_id(),'UPDATE');
  UPDATE public.documentos SET estado_documento_id=v_publicado,
    publicado_por=v_doc.subido_por,publicado_en=clock_timestamp() WHERE id=v_doc.id;
  RETURN v_doc.id;
END;
$$;

REVOKE ALL ON FUNCTION gemwork_bk03506.guard_document_write() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_puede_gestionar_evidencia(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_preparar_evidencia_tarea(uuid,uuid,text,text,text,bigint) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_publicar_evidencia_tarea(uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_puede_subir_evidencia(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_puede_gestionar_evidencia(uuid,uuid,uuid),
  public.fn_puede_subir_evidencia(text),
  public.fn_preparar_evidencia_tarea(uuid,uuid,text,text,text,bigint),
  public.fn_publicar_evidencia_tarea(uuid,boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
