-- 35.6.2. Candidato contrastado mediante MCP. Requiere autorización.
BEGIN;

-- Retirar este bloque únicamente con autorización expresa de aplicación.

-- postgres es el dueño de las funciones vigentes y de las tablas afectadas.
DO $owner$
BEGIN
  IF current_user <> 'postgres' OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND rolbypassrls
  ) OR NOT pg_catalog.has_schema_privilege(current_user,'auth','USAGE')
    OR NOT pg_catalog.has_function_privilege(current_user,'auth.uid()','EXECUTE')
  THEN
    RAISE EXCEPTION '35.6.2 requiere postgres con BYPASSRLS y acceso a auth.uid()';
  END IF;
END;
$owner$;
CREATE SCHEMA gemwork_bk03506 AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA gemwork_bk03506 FROM PUBLIC, anon, authenticated, service_role;

DO $check$
BEGIN
  IF pg_catalog.to_regprocedure('public.fn_cambiar_estado_tarea(uuid,text,text)') IS NOT NULL
    OR pg_catalog.to_regprocedure('public.fn_cambiar_estado_mi_notificacion(uuid,text)') IS NULL
    OR pg_catalog.to_regprocedure('public.fn_calcular_avance_proyecto(uuid)') IS NULL
    OR pg_catalog.to_regprocedure('public.fn_validar_ponderaciones_proyecto(uuid)') IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Firmas incompatibles con 35.6.1';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_proc f
      WHERE f.proowner='postgres'::regrole AND f.oid IN (
        pg_catalog.to_regprocedure('public.fn_cambiar_estado_mi_notificacion(uuid,text)'),
        pg_catalog.to_regprocedure('public.fn_trasladar_etapa_controlado(uuid,uuid,integer)'),
        pg_catalog.to_regprocedure('public.fn_trasladar_tarea_controlado(uuid,uuid,integer)')
      )) <> 3 THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Propietarios o firmas de RPC incompatibles con el contrato MCP';
  END IF;
  IF pg_catalog.to_regprocedure('public.fn_modificar_cronograma(text,uuid,date,date,date,date,text)') IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='La firma de cronograma ya existe';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('public.fn_cambiar_estado_mi_notificacion(uuid,text)','0ac98856b1ea848470ea67f514f7b24d'),
      ('public.fn_trasladar_etapa_controlado(uuid,uuid,integer)','61e108a483e4c311b19b72764cef374d'),
      ('public.fn_trasladar_tarea_controlado(uuid,uuid,integer)','a798ee43963afe329ae1634d9224fd4b'),
      ('public.fn_proteger_traslados_directos()','d603b63a89730a035f776dfaac70bd2c'),
      ('public.fn_proteger_rol_estado_usuario()','9cb698372f83a2fd145f8390f31b0f45'),
      ('public.fn_validar_asignacion_usuario()','71b253207025fabc7160a7f570fb3f29'),
      ('public.fn_coordinar_ponderaciones()','c20f2531e914ad9e141e5a07eb60b564'),
      ('public.fn_trigger_validar_ponderaciones()','3e890944c72f9bcf5711a6f4fa1198f5')
    ) expected(signature,digest)
    LEFT JOIN pg_catalog.pg_proc f ON f.oid=pg_catalog.to_regprocedure(expected.signature)
    WHERE pg_catalog.md5(f.prosrc) IS DISTINCT FROM expected.digest
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Las funciones de referencia cambiaron desde la consulta MCP';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('public.etapas','trg_etapas_proteger_traslado_directo'),
      ('public.tareas','trg_tareas_proteger_traslado_directo'),
      ('public.etapas','trg_etapas_coordinar_ponderaciones'),
      ('public.tareas','trg_tareas_coordinar_ponderaciones'),
      ('public.etapas','trg_etapas_validar_ponderaciones_diferido'),
      ('public.tareas','trg_tareas_validar_ponderaciones_diferido'),
      ('public.proyectos','trg_proyectos_validar_ponderaciones_diferido'),
      ('public.proyectos','trg_validar_inicio_ejecucion'),
      ('public.usuarios','trg_proteger_rol_estado_usuario'),
      ('public.proyecto_usuario_cliente','trg_validar_asignacion_cliente'),
      ('public.tarea_desarrollador','trg_validar_asignacion_desarrollador')
    ) expected(relation,trigger_name)
    LEFT JOIN pg_catalog.pg_trigger t ON t.tgrelid=pg_catalog.to_regclass(expected.relation)
      AND t.tgname=expected.trigger_name AND t.tgenabled IN ('O','A')
    WHERE t.oid IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Faltan triggers vigentes requeridos por INT-05 o INT-06B';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    WHERE c.relnamespace='public'::regnamespace
      AND c.relname IN ('usuarios','clientes','proyectos','etapas','tareas','documentos',
        'proyecto_usuario_cliente','tarea_desarrollador','historial_cronograma','bitacora','notificaciones')
      AND (c.relowner <> 'postgres'::regrole OR NOT c.relrowsecurity OR c.relforcerowsecurity)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Propiedad o RLS difieren del contrato MCP';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios AS u
    JOIN public.roles AS r ON r.id = u.rol_id
    JOIN public.estado_usuario AS s ON s.id = u.estado_usuario_id
    WHERE r.nombre = 'Administrador' AND s.nombre = 'Activo'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'No se encontró un Administrador activo';
  END IF;
  IF EXISTS (
    SELECT wanted.nombre FROM (VALUES ('Pendiente'), ('En curso'), ('Bloqueada'), ('Completada')) AS wanted(nombre)
    LEFT JOIN public.estado_tarea AS real ON real.nombre = wanted.nombre
    GROUP BY wanted.nombre HAVING count(real.id) <> 1
  ) OR EXISTS (
    SELECT wanted.nombre FROM (VALUES ('Iniciado'), ('En curso'), ('Terminado')) AS wanted(nombre)
    LEFT JOIN public.estado_proyecto AS real ON real.nombre = wanted.nombre
    GROUP BY wanted.nombre HAVING count(real.id) <> 1
  ) OR EXISTS (
    SELECT wanted.nombre FROM (VALUES ('No leída'), ('Leída'), ('Archivada')) AS wanted(nombre)
    LEFT JOIN public.estado_notificacion AS real ON real.nombre = wanted.nombre
    GROUP BY wanted.nombre HAVING count(real.id) <> 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Catálogos ausentes o ambiguos';
  END IF;
  IF EXISTS (
    SELECT wanted.nombre FROM (VALUES
      ('Nueva tarea asignada'),('Tarea bloqueada'),('Documento publicado'),('Cambio de cronograma')
    ) wanted(nombre)
    LEFT JOIN public.tipo_notificacion real ON real.nombre=wanted.nombre
    GROUP BY wanted.nombre HAVING count(real.id)<>1
  ) OR EXISTS (
    SELECT wanted.nombre FROM (VALUES
      ('Asignación de cliente'),('Asignación de desarrollador'),('Cambio de cronograma'),
      ('Cambio de estado de proyecto'),('Cambio de estado de tarea'),('Cambio de ponderación'),
      ('Carga de documento'),('Creación de etapa'),('Creación de proyecto'),('Creación de tarea'),
      ('Creación de usuario'),('Creación de cliente'),('Modificación de cliente'),('Modificación de etapa'),('Modificación de proyecto'),('Modificación de tarea'),
      ('Modificación de usuario'),('Publicación de documento'),('Retiro de publicación')
    ) wanted(nombre)
    LEFT JOIN public.tipo_evento_bitacora real ON real.nombre=wanted.nombre
    GROUP BY wanted.nombre HAVING count(real.id)<>1
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Catálogos de eventos ausentes o ambiguos';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.proyectos p JOIN public.estado_proyecto s ON s.id=p.estado_proyecto_id
    WHERE s.nombre='Terminado' AND (
      p.fecha_fin_real IS NULL OR p.fecha_fin_real<p.fecha_inicio
      OR NOT pg_catalog.isfinite(p.fecha_fin_real)
      OR NOT EXISTS (SELECT 1 FROM public.etapas e WHERE e.proyecto_id=p.id)
      OR EXISTS (
        SELECT 1 FROM public.etapas e WHERE e.proyecto_id=p.id AND (
          NOT EXISTS (SELECT 1 FROM public.tareas t WHERE t.etapa_id=e.id)
          OR EXISTS (SELECT 1 FROM public.tareas t LEFT JOIN public.estado_tarea st ON st.id=t.estado_tarea_id
            WHERE t.etapa_id=e.id AND st.nombre IS DISTINCT FROM 'Completada')
        )
      )
      OR public.fn_calcular_avance_proyecto(p.id) IS DISTINCT FROM 100::numeric
      OR (SELECT count(*) FROM public.fn_validar_ponderaciones_proyecto(p.id) v WHERE v.es_valido IS TRUE)<>1
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Hay proyectos terminados que requieren revisión';
  END IF;
END;
$check$;

-- Exclusión transaccional común. Un solo candado evita adquirir proyectos o
-- usuarios en órdenes distintos durante escrituras de múltiples filas.
CREATE FUNCTION gemwork_bk03506.lock_writes() RETURNS void
LANGUAGE plpgsql SECURITY INVOKER VOLATILE SET search_path = '' AS $fn$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE = '0A000', MESSAGE = 'Esta intervención requiere READ COMMITTED';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(3506, 1);
END;
$fn$;

CREATE FUNCTION gemwork_bk03506.active_actor()
RETURNS TABLE (id uuid, rol text)
LANGUAGE sql SECURITY DEFINER VOLATILE SET search_path = '' AS $fn$
  SELECT u.id, r.nombre::text
  FROM public.usuarios AS u
  JOIN public.roles AS r ON r.id = u.rol_id
  JOIN public.estado_usuario AS s ON s.id = u.estado_usuario_id
  WHERE u.auth_user_id = auth.uid() AND s.nombre = 'Activo'
$fn$;

-- BK-01. Esta autorización privada enlaza el UPDATE con el estado esperado.
CREATE TABLE gemwork_bk03506.task_transition (
  transaction_id xid8 NOT NULL,
  task_id uuid NOT NULL,
  state_from uuid NOT NULL,
  state_to uuid NOT NULL,
  PRIMARY KEY (transaction_id,task_id)
);
REVOKE ALL ON TABLE gemwork_bk03506.task_transition FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION gemwork_bk03506.before_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = '' AS $fn$
BEGIN
  PERFORM gemwork_bk03506.lock_writes();
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION USING ERRCODE = '0A000', MESSAGE = 'TRUNCATE no forma parte del flujo GemWork';
  END IF;
  -- La sesión que esperaba el candado puede haber perdido el acceso.
  IF auth.uid() IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM gemwork_bk03506.active_actor() a WHERE a.rol='Administrador')
    AND NOT (TG_TABLE_NAME='tareas' AND TG_OP='UPDATE' AND EXISTS (
      SELECT 1 FROM gemwork_bk03506.task_transition a
      WHERE a.transaction_id=pg_catalog.pg_current_xact_id()
    ))
  THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Se requiere un Administrador activo';
  END IF;
  RETURN NULL;
END;
$fn$;

CREATE TRIGGER gw03506_lock BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.proyectos
FOR EACH STATEMENT EXECUTE FUNCTION gemwork_bk03506.before_write();
CREATE TRIGGER gw03506_lock BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.etapas
FOR EACH STATEMENT EXECUTE FUNCTION gemwork_bk03506.before_write();
CREATE TRIGGER gw03506_lock BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.tareas
FOR EACH STATEMENT EXECUTE FUNCTION gemwork_bk03506.before_write();
CREATE TRIGGER gw03506_lock BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.usuarios
FOR EACH STATEMENT EXECUTE FUNCTION gemwork_bk03506.before_write();
CREATE TRIGGER gw03506_lock BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.proyecto_usuario_cliente
FOR EACH STATEMENT EXECUTE FUNCTION gemwork_bk03506.before_write();
CREATE TRIGGER gw03506_lock BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.tarea_desarrollador
FOR EACH STATEMENT EXECUTE FUNCTION gemwork_bk03506.before_write();

CREATE FUNCTION gemwork_bk03506.check_task_transition(p_from text, p_to text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER IMMUTABLE SET search_path = '' AS $fn$
BEGIN
  IF NOT coalesce(
    (p_from = 'Pendiente' AND p_to = 'En curso') OR
    (p_from = 'En curso' AND p_to IN ('Bloqueada', 'Completada')) OR
    (p_from = 'Bloqueada' AND p_to = 'En curso'), false
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Transición de tarea no permitida';
  END IF;
END;
$fn$;

CREATE FUNCTION gemwork_bk03506.guard_work() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = '' AS $fn$
DECLARE
  v_parent uuid;
  v_project uuid;
  v_source uuid;
  v_state text;
  v_old text;
  v_new text;
BEGIN
  IF TG_TABLE_NAME = 'etapas' THEN
    v_project := CASE WHEN TG_OP = 'DELETE' THEN OLD.proyecto_id ELSE NEW.proyecto_id END;
    IF TG_OP = 'UPDATE' THEN
      v_source := OLD.proyecto_id;
      IF OLD.proyecto_id IS NOT DISTINCT FROM NEW.proyecto_id
        AND OLD.peso_porcentual IS NOT DISTINCT FROM NEW.peso_porcentual THEN RETURN NEW; END IF;
    END IF;
  ELSE
    v_parent := CASE WHEN TG_OP = 'DELETE' THEN OLD.etapa_id ELSE NEW.etapa_id END;
    SELECT e.proyecto_id INTO STRICT v_project FROM public.etapas AS e WHERE e.id = v_parent;
    IF TG_OP = 'UPDATE' THEN
      SELECT e.proyecto_id INTO STRICT v_source FROM public.etapas AS e WHERE e.id = OLD.etapa_id;
      IF OLD.etapa_id IS NOT DISTINCT FROM NEW.etapa_id
        AND NEW.estado_tarea_id IS NOT DISTINCT FROM OLD.estado_tarea_id
        AND NEW.peso_porcentual IS NOT DISTINCT FROM OLD.peso_porcentual THEN RETURN NEW; END IF;
    END IF;
  END IF;

  -- INT-05 mantiene la autorización de traslados. Aquí se protegen ambos proyectos.
  IF v_source IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.proyectos p JOIN public.estado_proyecto s ON s.id=p.estado_proyecto_id
    WHERE p.id=v_source AND s.nombre='Terminado'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='El proyecto de origen está terminado';
  END IF;

  SELECT s.nombre INTO STRICT v_state
  FROM public.proyectos AS p JOIN public.estado_proyecto AS s ON s.id = p.estado_proyecto_id
  WHERE p.id = v_project;

  IF v_state = 'Terminado' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'La estructura ponderada de un proyecto terminado está cerrada';
  END IF;

  IF TG_TABLE_NAME = 'tareas' THEN
    IF TG_OP = 'INSERT' THEN
      SELECT nombre INTO STRICT v_new FROM public.estado_tarea WHERE id = NEW.estado_tarea_id;
      IF v_new IS DISTINCT FROM 'Pendiente' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Una tarea nueva debe comenzar Pendiente';
      END IF;
    ELSIF TG_OP = 'UPDATE' AND NEW.estado_tarea_id IS DISTINCT FROM OLD.estado_tarea_id THEN
      DELETE FROM gemwork_bk03506.task_transition a
      WHERE a.transaction_id=pg_catalog.pg_current_xact_id() AND a.task_id=OLD.id
        AND a.state_from=OLD.estado_tarea_id AND a.state_to=NEW.estado_tarea_id
        AND OLD.etapa_id=NEW.etapa_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='El cambio de estado requiere la RPC y el estado esperado';
      END IF;
      IF v_state IS DISTINCT FROM 'En curso' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'El proyecto debe estar En curso';
      END IF;
      SELECT nombre INTO STRICT v_old FROM public.estado_tarea WHERE id = OLD.estado_tarea_id;
      SELECT nombre INTO STRICT v_new FROM public.estado_tarea WHERE id = NEW.estado_tarea_id;
      PERFORM gemwork_bk03506.check_task_transition(v_old, v_new);
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER gw03506_work BEFORE INSERT OR UPDATE OR DELETE ON public.etapas
FOR EACH ROW EXECUTE FUNCTION gemwork_bk03506.guard_work();
CREATE TRIGGER gw03506_work BEFORE INSERT OR UPDATE OR DELETE ON public.tareas
FOR EACH ROW EXECUTE FUNCTION gemwork_bk03506.guard_work();

CREATE FUNCTION public.fn_cambiar_estado_tarea(
  p_tarea_id uuid, p_estado_nombre text, p_estado_anterior_nombre text
) RETURNS TABLE (id uuid, estado text)
LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = '' AS $fn$
DECLARE
  v_actor record;
  v_current text;
  v_current_id uuid;
  v_target public.estado_tarea.id%TYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sesión autenticada requerida';
  END IF;
  PERFORM gemwork_bk03506.lock_writes();
  SELECT * INTO v_actor FROM gemwork_bk03506.active_actor();
  IF v_actor.rol IS DISTINCT FROM 'Administrador' AND (
    v_actor.rol IS DISTINCT FROM 'Desarrollador' OR NOT EXISTS (
      SELECT 1 FROM public.tarea_desarrollador AS a
      WHERE a.tarea_id = p_tarea_id AND a.desarrollador_id = v_actor.id
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No tienes acceso para cambiar el estado de esta tarea';
  END IF;

  SELECT s.nombre,t.estado_tarea_id INTO v_current,v_current_id FROM public.tareas AS t
  JOIN public.estado_tarea AS s ON s.id = t.estado_tarea_id
  WHERE t.id = p_tarea_id FOR UPDATE OF t;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Tarea no disponible';
  END IF;
  IF v_current IS DISTINCT FROM p_estado_anterior_nombre THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'El estado de la tarea cambió';
  END IF;
  PERFORM gemwork_bk03506.check_task_transition(v_current, p_estado_nombre);
  SELECT s.id INTO STRICT v_target FROM public.estado_tarea AS s WHERE s.nombre = p_estado_nombre;
  INSERT INTO gemwork_bk03506.task_transition VALUES
    (pg_catalog.pg_current_xact_id(),p_tarea_id,v_current_id,v_target);
  UPDATE public.tareas AS t SET estado_tarea_id = v_target WHERE t.id = p_tarea_id;
  IF EXISTS (
    SELECT 1 FROM gemwork_bk03506.task_transition a
    WHERE a.transaction_id=pg_catalog.pg_current_xact_id() AND a.task_id=p_tarea_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='La autorización de tarea no se consumió';
  END IF;
  RETURN QUERY
    SELECT t.id, s.nombre::text FROM public.tareas AS t
    JOIN public.estado_tarea AS s ON s.id = t.estado_tarea_id
    WHERE t.id = p_tarea_id AND t.estado_tarea_id = v_target;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'El estado de la tarea no se confirmó';
  END IF;
END;
$fn$;

-- BK-02. Se añade una defensa; se conservan los triggers existentes.
CREATE FUNCTION gemwork_bk03506.guard_project() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = '' AS $fn$
DECLARE
  v_old text;
  v_new text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT nombre INTO STRICT v_new FROM public.estado_proyecto WHERE id = NEW.estado_proyecto_id;
    IF v_new <> 'Iniciado' OR NEW.fecha_fin_real IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Un proyecto nuevo debe comenzar Iniciado';
    END IF;
    RETURN NEW;
  END IF;

  SELECT nombre INTO STRICT v_old FROM public.estado_proyecto WHERE id = OLD.estado_proyecto_id;
  IF TG_OP = 'DELETE' THEN
    IF v_old = 'Terminado' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'El proyecto terminado debe conservarse';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.estado_proyecto_id IS NOT DISTINCT FROM OLD.estado_proyecto_id THEN
    IF NEW.fecha_fin_real IS DISTINCT FROM OLD.fecha_fin_real THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'La fecha real solo se establece durante el cierre';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM gemwork_bk03506.active_actor() AS a WHERE a.rol = 'Administrador') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Se requiere un Administrador activo';
  END IF;
  SELECT nombre INTO STRICT v_new FROM public.estado_proyecto WHERE id = NEW.estado_proyecto_id;
  IF NOT ((v_old = 'Iniciado' AND v_new = 'En curso') OR (v_old = 'En curso' AND v_new = 'Terminado')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Transición de proyecto no permitida';
  END IF;
  IF NEW.fecha_inicio IS NULL OR NEW.fecha_fin_estimada IS NULL OR NEW.fecha_fin_estimada < NEW.fecha_inicio
    OR NOT pg_catalog.isfinite(NEW.fecha_inicio) OR NOT pg_catalog.isfinite(NEW.fecha_fin_estimada)
    OR NOT EXISTS (SELECT 1 FROM public.etapas AS e WHERE e.proyecto_id = OLD.id)
    OR EXISTS (
      SELECT 1 FROM public.etapas AS e WHERE e.proyecto_id = OLD.id AND (
        e.fecha_inicio IS NULL OR e.fecha_fin_estimada IS NULL OR e.fecha_fin_estimada < e.fecha_inicio
            OR NOT pg_catalog.isfinite(e.fecha_inicio) OR NOT pg_catalog.isfinite(e.fecha_fin_estimada)
        OR NOT EXISTS (SELECT 1 FROM public.tareas AS t WHERE t.etapa_id = e.id)
        OR EXISTS (SELECT 1 FROM public.tareas AS t WHERE t.etapa_id = e.id
          AND (t.fecha_inicio IS NULL OR t.fecha_fin_estimada IS NULL OR t.fecha_fin_estimada < t.fecha_inicio
            OR NOT pg_catalog.isfinite(t.fecha_inicio) OR NOT pg_catalog.isfinite(t.fecha_fin_estimada)))
      )
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Faltan etapas, tareas o fechas planificadas válidas';
  END IF;
  IF (SELECT count(*) FROM public.fn_validar_ponderaciones_proyecto(OLD.id) AS v WHERE v.es_valido IS TRUE) <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Ponderaciones inválidas';
  END IF;
  IF v_new = 'En curso' AND NEW.fecha_fin_real IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'La fecha real corresponde al cierre';
  END IF;
  IF v_new = 'Terminado' AND (
    NEW.fecha_fin_real IS NULL OR NEW.fecha_fin_real < NEW.fecha_inicio
    OR NOT pg_catalog.isfinite(NEW.fecha_fin_real)
    OR NEW.fecha_fin_real > (pg_catalog.clock_timestamp() AT TIME ZONE 'America/La_Paz')::date
    OR public.fn_calcular_avance_proyecto(OLD.id) IS DISTINCT FROM 100::numeric
    OR EXISTS (
      SELECT 1 FROM public.etapas AS e JOIN public.tareas AS t ON t.etapa_id = e.id
      LEFT JOIN public.estado_tarea AS s ON s.id = t.estado_tarea_id
      WHERE e.proyecto_id = OLD.id AND s.nombre IS DISTINCT FROM 'Completada'
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'El cierre requiere fecha real válida y todas las tareas completadas';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER gw03506_project BEFORE INSERT OR UPDATE OR DELETE ON public.proyectos
FOR EACH ROW EXECUTE FUNCTION gemwork_bk03506.guard_project();

CREATE TRIGGER gw03506_lock BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.documentos
FOR EACH STATEMENT EXECUTE FUNCTION gemwork_bk03506.before_write();

-- BK-03. Tipos confirmados en el texto 35.6.2.
CREATE FUNCTION gemwork_bk03506.audit_event(p_kind text, p_table text, p_id uuid, p_before jsonb, p_after jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_kind public.tipo_evento_bitacora.id%TYPE;
  v_actor uuid;
BEGIN
  SELECT id INTO STRICT v_kind FROM public.tipo_evento_bitacora WHERE nombre = p_kind;
  SELECT u.id INTO v_actor FROM public.usuarios u WHERE u.auth_user_id=auth.uid();
  INSERT INTO public.bitacora(usuario_id,tipo_evento_bitacora_id,tabla_afectada,registro_afectado_id,descripcion,datos_anteriores,datos_nuevos,fecha_evento)
  VALUES (v_actor,v_kind,p_table,p_id,
    CASE WHEN p_kind='Carga de documento' THEN 'Registro de metadatos del documento'
      WHEN p_table='usuarios' AND p_before->>'estado_usuario_id' IS DISTINCT FROM p_after->>'estado_usuario_id'
        AND p_before IS NOT NULL THEN 'Cambio de estado de usuario'
      WHEN p_kind IN ('Asignación de cliente','Asignación de desarrollador') AND p_after IS NULL THEN 'Retiro de asignación'
      ELSE p_kind END,
    p_before,p_after,pg_catalog.now());
END;
$fn$;

CREATE FUNCTION gemwork_bk03506.audit_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_kind text;
  v_before jsonb;
  v_after jsonb;
  v_id uuid;
BEGIN
  CASE TG_TABLE_NAME
  WHEN 'proyectos', 'etapas', 'tareas' THEN
    v_id := NEW.id;
    -- Las fechas planificadas se auditan en la RPC, el cierre conserva su fecha real.
    v_after := pg_catalog.jsonb_build_object('nombre',NEW.nombre);
    IF TG_OP = 'UPDATE' THEN v_before := pg_catalog.jsonb_build_object('nombre',OLD.nombre); END IF;
    IF TG_TABLE_NAME = 'proyectos' THEN
      v_after := v_after || pg_catalog.jsonb_build_object('cliente_id',NEW.cliente_id,'estado_proyecto_id',NEW.estado_proyecto_id,'fecha_fin_real',NEW.fecha_fin_real);
      IF TG_OP = 'UPDATE' THEN
        v_before := v_before || pg_catalog.jsonb_build_object('cliente_id',OLD.cliente_id,'estado_proyecto_id',OLD.estado_proyecto_id,'fecha_fin_real',OLD.fecha_fin_real);
        IF OLD.estado_proyecto_id IS DISTINCT FROM NEW.estado_proyecto_id THEN v_kind := 'Cambio de estado de proyecto'; END IF;
      END IF;
      v_kind := coalesce(v_kind, CASE WHEN TG_OP = 'INSERT' THEN 'Creación de proyecto' ELSE 'Modificación de proyecto' END);
    ELSE
      v_after := v_after || pg_catalog.jsonb_build_object('peso_porcentual',NEW.peso_porcentual,'orden',NEW.orden);
      IF TG_OP = 'UPDATE' THEN
        v_before := v_before || pg_catalog.jsonb_build_object('peso_porcentual',OLD.peso_porcentual,'orden',OLD.orden);
        IF OLD.peso_porcentual IS DISTINCT FROM NEW.peso_porcentual THEN v_kind := 'Cambio de ponderación'; END IF;
      END IF;
      IF TG_TABLE_NAME = 'etapas' THEN
        v_after := v_after || pg_catalog.jsonb_build_object('proyecto_id',NEW.proyecto_id);
        IF TG_OP = 'UPDATE' THEN v_before := v_before || pg_catalog.jsonb_build_object('proyecto_id',OLD.proyecto_id); END IF;
        v_kind := coalesce(v_kind, CASE WHEN TG_OP = 'INSERT' THEN 'Creación de etapa' ELSE 'Modificación de etapa' END);
      ELSE
        v_after := v_after || pg_catalog.jsonb_build_object('etapa_id',NEW.etapa_id,'estado_tarea_id',NEW.estado_tarea_id);
        IF TG_OP = 'UPDATE' THEN
          v_before := v_before || pg_catalog.jsonb_build_object('etapa_id',OLD.etapa_id,'estado_tarea_id',OLD.estado_tarea_id);
          IF OLD.estado_tarea_id IS DISTINCT FROM NEW.estado_tarea_id THEN
            IF v_kind='Cambio de ponderación' THEN
              PERFORM gemwork_bk03506.audit_event(v_kind,TG_TABLE_NAME,v_id,
                pg_catalog.jsonb_build_object('peso_porcentual',OLD.peso_porcentual),
                pg_catalog.jsonb_build_object('peso_porcentual',NEW.peso_porcentual));
            END IF;
            v_kind := 'Cambio de estado de tarea';
          END IF;
          IF OLD.observaciones IS DISTINCT FROM NEW.observaciones THEN
            v_after := v_after || pg_catalog.jsonb_build_object('observaciones_modificadas',true);
          END IF;
        END IF;
        v_kind := coalesce(v_kind, CASE WHEN TG_OP = 'INSERT' THEN 'Creación de tarea' ELSE 'Modificación de tarea' END);
      END IF;
    END IF;
    IF TG_OP='INSERT' THEN
      v_after := v_after || pg_catalog.jsonb_build_object('fecha_inicio',NEW.fecha_inicio,'fecha_fin_estimada',NEW.fecha_fin_estimada);
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.descripcion IS DISTINCT FROM NEW.descripcion THEN
      v_after := v_after || pg_catalog.jsonb_build_object('descripcion_modificada',true);
    END IF;
  WHEN 'clientes' THEN
    v_id := NEW.id;
    v_kind := CASE WHEN TG_OP='INSERT' THEN 'Creación de cliente' ELSE 'Modificación de cliente' END;
    v_after := pg_catalog.jsonb_build_object('tipo_cliente',NEW.tipo_cliente);
    IF TG_OP='UPDATE' THEN
      v_before := pg_catalog.jsonb_build_object('tipo_cliente',OLD.tipo_cliente);
      IF (OLD.nombre,OLD.correo,OLD.telefono,OLD.direccion,OLD.observaciones)
        IS DISTINCT FROM (NEW.nombre,NEW.correo,NEW.telefono,NEW.direccion,NEW.observaciones) THEN
        v_after := v_after || pg_catalog.jsonb_build_object(
          'nombre_modificado',OLD.nombre IS DISTINCT FROM NEW.nombre,
          'correo_modificado',OLD.correo IS DISTINCT FROM NEW.correo,
          'telefono_modificado',OLD.telefono IS DISTINCT FROM NEW.telefono,
          'direccion_modificada',OLD.direccion IS DISTINCT FROM NEW.direccion,
          'observaciones_modificadas',OLD.observaciones IS DISTINCT FROM NEW.observaciones);
      END IF;
    END IF;
  WHEN 'usuarios' THEN
    v_id := NEW.id;
    v_kind := CASE WHEN TG_OP = 'INSERT' THEN 'Creación de usuario' ELSE 'Modificación de usuario' END;
    v_after := pg_catalog.jsonb_build_object('rol_id',NEW.rol_id,'estado_usuario_id',NEW.estado_usuario_id);
    IF TG_OP = 'UPDATE' THEN
      v_before := pg_catalog.jsonb_build_object('rol_id',OLD.rol_id,'estado_usuario_id',OLD.estado_usuario_id);
      IF (OLD.nombre_usuario,OLD.nombre_completo,OLD.telefono,OLD.auth_user_id)
        IS DISTINCT FROM (NEW.nombre_usuario,NEW.nombre_completo,NEW.telefono,NEW.auth_user_id) THEN
        v_after := v_after || pg_catalog.jsonb_build_object(
          'login_modificado',OLD.nombre_usuario IS DISTINCT FROM NEW.nombre_usuario,
          'nombre_modificado',OLD.nombre_completo IS DISTINCT FROM NEW.nombre_completo,
          'telefono_modificado',OLD.telefono IS DISTINCT FROM NEW.telefono,
          'identidad_auth_modificada',OLD.auth_user_id IS DISTINCT FROM NEW.auth_user_id);
      END IF;
    END IF;
  WHEN 'proyecto_usuario_cliente', 'tarea_desarrollador' THEN
    IF TG_TABLE_NAME = 'proyecto_usuario_cliente' THEN
      v_kind := 'Asignación de cliente';
      v_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.proyecto_id ELSE NEW.proyecto_id END;
      IF TG_OP <> 'INSERT' THEN v_before := pg_catalog.jsonb_build_object('proyecto_id',OLD.proyecto_id,'usuario_id',OLD.usuario_id,'asignado_por',OLD.asignado_por); END IF;
      IF TG_OP <> 'DELETE' THEN v_after := pg_catalog.jsonb_build_object('proyecto_id',NEW.proyecto_id,'usuario_id',NEW.usuario_id,'asignado_por',NEW.asignado_por); END IF;
    ELSE
      v_kind := 'Asignación de desarrollador';
      v_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.tarea_id ELSE NEW.tarea_id END;
      IF TG_OP <> 'INSERT' THEN v_before := pg_catalog.jsonb_build_object('tarea_id',OLD.tarea_id,'desarrollador_id',OLD.desarrollador_id,'asignado_por',OLD.asignado_por); END IF;
      IF TG_OP <> 'DELETE' THEN v_after := pg_catalog.jsonb_build_object('tarea_id',NEW.tarea_id,'desarrollador_id',NEW.desarrollador_id,'asignado_por',NEW.asignado_por); END IF;
    END IF;
  WHEN 'documentos' THEN
    v_id := NEW.id;
    IF TG_OP = 'INSERT' THEN
      v_kind := 'Carga de documento';
      v_after := pg_catalog.jsonb_build_object('evento','Registro de metadatos','proyecto_id',NEW.proyecto_id,
        'extension',NEW.extension,'tamano_bytes',NEW.tamano_bytes,'estado_documento_id',NEW.estado_documento_id,
        'alcance_documento_id',NEW.alcance_documento_id);
      IF EXISTS (SELECT 1 FROM public.estado_documento WHERE id=NEW.estado_documento_id AND nombre='Publicado') THEN
        PERFORM gemwork_bk03506.audit_event('Publicación de documento',TG_TABLE_NAME,v_id,NULL,v_after);
      END IF;
    ELSE
      IF OLD.estado_documento_id IS NOT DISTINCT FROM NEW.estado_documento_id THEN RETURN NULL; END IF;
      SELECT CASE WHEN n.nombre='Publicado' THEN 'Publicación de documento'
                  WHEN o.nombre='Publicado' THEN 'Retiro de publicación' END
        INTO v_kind FROM public.estado_documento n CROSS JOIN public.estado_documento o
        WHERE n.id=NEW.estado_documento_id AND o.id=OLD.estado_documento_id;
      v_before := pg_catalog.jsonb_build_object('estado_documento_id',OLD.estado_documento_id,'alcance_documento_id',OLD.alcance_documento_id);
      v_after := pg_catalog.jsonb_build_object('estado_documento_id',NEW.estado_documento_id,'alcance_documento_id',NEW.alcance_documento_id);
    END IF;
  END CASE;
  IF v_kind IS NOT NULL AND v_before IS DISTINCT FROM v_after THEN
    PERFORM gemwork_bk03506.audit_event(v_kind,TG_TABLE_NAME,v_id,v_before,v_after);
  END IF;
  RETURN NULL;
END;
$fn$;

-- BK-05. Un único productor por operación y destinatarios deduplicados.
CREATE FUNCTION gemwork_bk03506.notify_event(p_kind text,p_project uuid,p_stage uuid,p_task uuid,p_document uuid,p_assignee uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_kind public.tipo_notificacion.id%TYPE;
  v_state public.estado_notificacion.id%TYPE;
BEGIN
  SELECT id INTO STRICT v_kind FROM public.tipo_notificacion WHERE nombre = p_kind;
  SELECT id INTO STRICT v_state FROM public.estado_notificacion WHERE nombre = 'No leída';
  INSERT INTO public.notificaciones(usuario_id,tipo_notificacion_id,estado_notificacion_id,proyecto_id,tarea_id,documento_id,titulo,mensaje,leida_en,creado_en)
  SELECT u.id,v_kind,v_state,p_project,p_task,p_document,p_kind,'Hay una actualización en GemWork Tracking.',NULL,pg_catalog.now()
  FROM public.usuarios u
  JOIN public.roles r ON r.id = u.rol_id
  JOIN public.estado_usuario s ON s.id = u.estado_usuario_id AND s.nombre = 'Activo'
  WHERE CASE p_kind
    WHEN 'Nueva tarea asignada' THEN r.nombre = 'Desarrollador' AND u.id = p_assignee
    WHEN 'Tarea bloqueada' THEN r.nombre = 'Administrador'
    WHEN 'Documento publicado' THEN r.nombre = 'Administrador' OR
      (r.nombre = 'Desarrollador' AND EXISTS (
        SELECT 1 FROM public.tarea_desarrollador a JOIN public.tareas t ON t.id=a.tarea_id
        JOIN public.etapas e ON e.id=t.etapa_id WHERE a.desarrollador_id=u.id AND e.proyecto_id=p_project
      )) OR (r.nombre = 'Cliente' AND EXISTS (
        SELECT 1 FROM public.proyecto_usuario_cliente a JOIN public.documentos d ON d.proyecto_id=a.proyecto_id
        JOIN public.alcance_documento ac ON ac.id=d.alcance_documento_id
        WHERE a.usuario_id=u.id AND a.proyecto_id=p_project AND d.id=p_document AND ac.nombre='Cliente'
      ))
    WHEN 'Cambio de cronograma' THEN
      (r.nombre='Cliente' AND EXISTS (SELECT 1 FROM public.proyecto_usuario_cliente a WHERE a.usuario_id=u.id AND a.proyecto_id=p_project))
      OR (r.nombre='Desarrollador' AND EXISTS (
        SELECT 1 FROM public.tarea_desarrollador a JOIN public.tareas t ON t.id=a.tarea_id
        JOIN public.etapas e ON e.id=t.etapa_id
        WHERE a.desarrollador_id=u.id AND e.proyecto_id=p_project
          AND (p_stage IS NULL OR e.id=p_stage) AND (p_task IS NULL OR t.id=p_task)
      ))
    ELSE false
  END;
END;
$fn$;

CREATE FUNCTION gemwork_bk03506.notify_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_project uuid;
BEGIN
  IF TG_TABLE_NAME = 'documentos' THEN
    IF (CASE WHEN TG_OP='INSERT' THEN true ELSE OLD.estado_documento_id IS DISTINCT FROM NEW.estado_documento_id END) AND EXISTS (
      SELECT 1 FROM public.estado_documento WHERE id=NEW.estado_documento_id AND nombre='Publicado'
    ) THEN
      PERFORM gemwork_bk03506.notify_event('Documento publicado',NEW.proyecto_id,NULL,NULL,NEW.id,NULL);
    END IF;
  ELSIF TG_TABLE_NAME = 'tareas' THEN
    IF OLD.estado_tarea_id IS DISTINCT FROM NEW.estado_tarea_id AND EXISTS (
      SELECT 1 FROM public.estado_tarea WHERE id=NEW.estado_tarea_id AND nombre='Bloqueada'
    ) THEN
      SELECT proyecto_id INTO STRICT v_project FROM public.etapas WHERE id=NEW.etapa_id;
      PERFORM gemwork_bk03506.notify_event('Tarea bloqueada',v_project,NULL,NEW.id,NULL,NULL);
    END IF;
  ELSE
    IF TG_OP = 'UPDATE' AND (OLD.tarea_id,OLD.desarrollador_id) IS NOT DISTINCT FROM (NEW.tarea_id,NEW.desarrollador_id) THEN RETURN NULL; END IF;
    SELECT e.proyecto_id INTO STRICT v_project FROM public.tareas t JOIN public.etapas e ON e.id=t.etapa_id WHERE t.id=NEW.tarea_id;
    PERFORM gemwork_bk03506.notify_event('Nueva tarea asignada',v_project,NULL,NEW.tarea_id,NULL,NEW.desarrollador_id);
  END IF;
  RETURN NULL;
END;
$fn$;
-- BK-04. La autorización es una fila privada de vida transaccional.
CREATE TABLE gemwork_bk03506.schedule_write (
  transaction_id xid8 NOT NULL,
  entity text NOT NULL,
  record_id uuid NOT NULL,
  start_before date NOT NULL,
  end_before date NOT NULL,
  start_after date NOT NULL,
  end_after date NOT NULL,
  PRIMARY KEY (transaction_id,entity,record_id)
);
REVOKE ALL ON TABLE gemwork_bk03506.schedule_write FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION gemwork_bk03506.guard_schedule() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF (NEW.fecha_inicio,NEW.fecha_fin_estimada) IS DISTINCT FROM (OLD.fecha_inicio,OLD.fecha_fin_estimada) THEN
    DELETE FROM gemwork_bk03506.schedule_write w
    WHERE w.transaction_id=pg_catalog.pg_current_xact_id() AND w.entity=TG_TABLE_NAME AND w.record_id=OLD.id
      AND (w.start_before,w.end_before,w.start_after,w.end_after) =
          (OLD.fecha_inicio,OLD.fecha_fin_estimada,NEW.fecha_inicio,NEW.fecha_fin_estimada);
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Los cambios de cronograma requieren motivo y RPC';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE FUNCTION public.fn_modificar_cronograma(
  p_entidad text,p_registro_id uuid,p_inicio_esperado date,p_fin_esperado date,
  p_inicio_nuevo date,p_fin_nuevo date,p_motivo text
) RETURNS TABLE (id uuid,fecha_inicio date,fecha_fin_estimada date,cambios integer)
LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = '' AS $fn$
DECLARE
  v_actor uuid;
  v_project uuid;
  v_start date;
  v_end date;
  v_row record;
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Sesión autenticada requerida';
  END IF;
  PERFORM gemwork_bk03506.lock_writes();
  SELECT a.id INTO v_actor FROM gemwork_bk03506.active_actor() a WHERE a.rol='Administrador';
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Se requiere un Administrador activo'; END IF;
  IF p_motivo IS NULL OR p_motivo !~ '[^[:space:]]' OR p_inicio_nuevo IS NULL OR p_fin_nuevo IS NULL
     OR NOT pg_catalog.isfinite(p_inicio_nuevo) OR NOT pg_catalog.isfinite(p_fin_nuevo) OR p_fin_nuevo<p_inicio_nuevo
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Se requiere un motivo y un intervalo válido'; END IF;

  CASE p_entidad
  WHEN 'proyectos' THEN
    SELECT p.id,p.fecha_inicio,p.fecha_fin_estimada INTO v_project,v_start,v_end
    FROM public.proyectos p WHERE p.id=p_registro_id FOR UPDATE OF p;
  WHEN 'etapas' THEN
    SELECT e.proyecto_id,e.fecha_inicio,e.fecha_fin_estimada INTO v_project,v_start,v_end
    FROM public.etapas e WHERE e.id=p_registro_id FOR UPDATE OF e;
  WHEN 'tareas' THEN
    SELECT e.proyecto_id,t.fecha_inicio,t.fecha_fin_estimada INTO v_project,v_start,v_end
    FROM public.tareas t JOIN public.etapas e ON e.id=t.etapa_id WHERE t.id=p_registro_id FOR UPDATE OF t;
  ELSE RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Entidad de cronograma inválida';
  END CASE;
  IF v_project IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Registro de cronograma no encontrado'; END IF;
  IF (v_start,v_end) IS DISTINCT FROM (p_inicio_esperado,p_fin_esperado) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Las fechas cambiaron';
  END IF;
  IF (v_start,v_end) IS NOT DISTINCT FROM (p_inicio_nuevo,p_fin_nuevo) THEN
    RETURN QUERY SELECT p_registro_id,v_start,v_end,0;
    RETURN;
  END IF;
  IF v_start IS NULL OR v_end IS NULL OR NOT pg_catalog.isfinite(v_start) OR NOT pg_catalog.isfinite(v_end) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Las fechas anteriores no se pueden representar en el historial';
  END IF;

  INSERT INTO gemwork_bk03506.schedule_write VALUES
    (pg_catalog.pg_current_xact_id(),p_entidad,p_registro_id,v_start,v_end,p_inicio_nuevo,p_fin_nuevo);
  CASE p_entidad
  WHEN 'proyectos' THEN
    UPDATE public.proyectos p SET fecha_inicio=p_inicio_nuevo,fecha_fin_estimada=p_fin_nuevo
    WHERE p.id=p_registro_id RETURNING p.fecha_inicio,p.fecha_fin_estimada INTO STRICT v_row;
  WHEN 'etapas' THEN
    UPDATE public.etapas e SET fecha_inicio=p_inicio_nuevo,fecha_fin_estimada=p_fin_nuevo
    WHERE e.id=p_registro_id RETURNING e.fecha_inicio,e.fecha_fin_estimada INTO STRICT v_row;
  WHEN 'tareas' THEN
    UPDATE public.tareas t SET fecha_inicio=p_inicio_nuevo,fecha_fin_estimada=p_fin_nuevo
    WHERE t.id=p_registro_id RETURNING t.fecha_inicio,t.fecha_fin_estimada INTO STRICT v_row;
  END CASE;
  IF (v_row.fecha_inicio,v_row.fecha_fin_estimada) IS DISTINCT FROM (p_inicio_nuevo,p_fin_nuevo)
    OR EXISTS (
      SELECT 1 FROM gemwork_bk03506.schedule_write w
      WHERE w.transaction_id=pg_catalog.pg_current_xact_id() AND w.entity=p_entidad AND w.record_id=p_registro_id
    )
  THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='El resultado del cronograma difiere de las fechas solicitadas';
  END IF;

  INSERT INTO public.historial_cronograma(proyecto_id,etapa_id,tarea_id,campo_modificado,fecha_anterior,fecha_nueva,motivo,usuario_id,modificado_en)
  SELECT v_project,CASE WHEN p_entidad='etapas' THEN p_registro_id END,
    CASE WHEN p_entidad='tareas' THEN p_registro_id END,
    x.campo,x.anterior,x.nueva,pg_catalog.btrim(p_motivo),v_actor,pg_catalog.now()
  FROM (VALUES ('fecha_inicio',v_start,p_inicio_nuevo),('fecha_fin_estimada',v_end,p_fin_nuevo)) x(campo,anterior,nueva)
  WHERE x.anterior IS DISTINCT FROM x.nueva;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM gemwork_bk03506.audit_event('Cambio de cronograma',p_entidad,p_registro_id,
    pg_catalog.jsonb_build_object('fecha_inicio',v_start,'fecha_fin_estimada',v_end),
    pg_catalog.jsonb_build_object('fecha_inicio',p_inicio_nuevo,'fecha_fin_estimada',p_fin_nuevo));
  PERFORM gemwork_bk03506.notify_event('Cambio de cronograma',v_project,
    CASE WHEN p_entidad='etapas' THEN p_registro_id END,
    CASE WHEN p_entidad='tareas' THEN p_registro_id END,NULL,NULL);
  RETURN QUERY SELECT p_registro_id,v_row.fecha_inicio,v_row.fecha_fin_estimada,v_count;
END;
$fn$;

CREATE TRIGGER gw03506_audit AFTER INSERT OR UPDATE ON public.proyectos
FOR EACH ROW EXECUTE FUNCTION gemwork_bk03506.audit_row();
CREATE TRIGGER gw03506_audit AFTER INSERT OR UPDATE ON public.etapas
FOR EACH ROW EXECUTE FUNCTION gemwork_bk03506.audit_row();
CREATE TRIGGER gw03506_audit AFTER INSERT OR UPDATE ON public.tareas
FOR EACH ROW EXECUTE FUNCTION gemwork_bk03506.audit_row();
CREATE TRIGGER gw03506_audit AFTER INSERT OR UPDATE ON public.clientes
FOR EACH ROW EXECUTE FUNCTION gemwork_bk03506.audit_row();
CREATE TRIGGER gw03506_audit AFTER INSERT OR UPDATE ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION gemwork_bk03506.audit_row();
CREATE TRIGGER gw03506_audit AFTER INSERT OR UPDATE ON public.documentos
FOR EACH ROW EXECUTE FUNCTION gemwork_bk03506.audit_row();
CREATE TRIGGER gw03506_audit AFTER INSERT OR UPDATE OR DELETE ON public.proyecto_usuario_cliente
FOR EACH ROW EXECUTE FUNCTION gemwork_bk03506.audit_row();
CREATE TRIGGER gw03506_audit AFTER INSERT OR UPDATE OR DELETE ON public.tarea_desarrollador
FOR EACH ROW EXECUTE FUNCTION gemwork_bk03506.audit_row();
CREATE TRIGGER gw03506_notify AFTER UPDATE ON public.tareas
FOR EACH ROW EXECUTE FUNCTION gemwork_bk03506.notify_row();
CREATE TRIGGER gw03506_notify AFTER INSERT OR UPDATE ON public.documentos
FOR EACH ROW EXECUTE FUNCTION gemwork_bk03506.notify_row();
CREATE TRIGGER gw03506_notify AFTER INSERT OR UPDATE ON public.tarea_desarrollador
FOR EACH ROW EXECUTE FUNCTION gemwork_bk03506.notify_row();
CREATE TRIGGER gw03506_schedule AFTER UPDATE ON public.proyectos
FOR EACH ROW EXECUTE FUNCTION gemwork_bk03506.guard_schedule();
CREATE TRIGGER gw03506_schedule AFTER UPDATE ON public.etapas
FOR EACH ROW EXECUTE FUNCTION gemwork_bk03506.guard_schedule();
CREATE TRIGGER gw03506_schedule AFTER UPDATE ON public.tareas
FOR EACH ROW EXECUTE FUNCTION gemwork_bk03506.guard_schedule();

-- BK-06. El trigger existente conserva INT-06B.
CREATE FUNCTION gemwork_bk03506.guard_self() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = '' AS $fn$
BEGIN
  IF OLD.auth_user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.roles AS r WHERE r.id = OLD.rol_id AND r.nombre = 'Administrador')
    AND EXISTS (SELECT 1 FROM public.estado_usuario AS s WHERE s.id = OLD.estado_usuario_id AND s.nombre = 'Activo')
  THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'No puedes eliminar tu propio perfil de administrador';
    END IF;
    IF NEW.rol_id IS DISTINCT FROM OLD.rol_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'No puedes cambiar tu propio rol de administrador';
    END IF;
    IF NEW.estado_usuario_id IS DISTINCT FROM OLD.estado_usuario_id
      AND NOT EXISTS (SELECT 1 FROM public.estado_usuario AS s WHERE s.id = NEW.estado_usuario_id AND s.nombre = 'Activo')
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'No puedes desactivar tu propia cuenta';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$fn$;

CREATE FUNCTION gemwork_bk03506.keep_active_admin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = '' AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios AS u
    JOIN public.roles AS r ON r.id = u.rol_id
    JOIN public.estado_usuario AS s ON s.id = u.estado_usuario_id
    WHERE r.nombre = 'Administrador' AND s.nombre = 'Activo'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Debe quedar al menos un Administrador activo';
  END IF;
  RETURN NULL;
END;
$fn$;

CREATE TRIGGER gw03506_self BEFORE UPDATE OR DELETE ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION gemwork_bk03506.guard_self();
CREATE TRIGGER gw03506_admin AFTER UPDATE OR DELETE ON public.usuarios
FOR EACH STATEMENT EXECUTE FUNCTION gemwork_bk03506.keep_active_admin();

-- BK-07/BK-08. La reversión restaura el cuerpo y atributos vigentes al instalar.
CREATE TABLE gemwork_bk03506.original_rpc (
  signature regprocedure PRIMARY KEY,
  definition text NOT NULL
);
REVOKE ALL ON TABLE gemwork_bk03506.original_rpc FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO gemwork_bk03506.original_rpc (signature,definition)
SELECT s.signature,pg_catalog.pg_get_functiondef(s.signature)
FROM (VALUES
  ('public.fn_cambiar_estado_mi_notificacion(uuid,text)'::regprocedure),
  ('public.fn_trasladar_etapa_controlado(uuid,uuid,integer)'::regprocedure),
  ('public.fn_trasladar_tarea_controlado(uuid,uuid,integer)'::regprocedure)
) s(signature);

-- Las RPC INT-05 toman el mismo candado antes de consultar o bloquear filas.
CREATE OR REPLACE FUNCTION public.fn_trasladar_etapa_controlado(p_etapa_id uuid, p_proyecto_destino_id uuid, p_nuevo_orden integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_origen UUID;
    v_origen_actual UUID;
    v_id UUID;
    v_autorizacion UUID;
    v_filas INTEGER;
BEGIN
    PERFORM gemwork_bk03506.lock_writes();
    -- Identidad y autorización.
    IF auth.uid() IS NULL
       OR NOT public.fn_es_administrador_activo()
    THEN
        RAISE EXCEPTION
            'INT-05: Se requiere un administrador activo.'
            USING ERRCODE = '42501';
    END IF;

    -- Parámetros.
    IF p_etapa_id IS NULL
       OR p_proyecto_destino_id IS NULL
       OR p_nuevo_orden IS NULL
       OR p_nuevo_orden <= 0
    THEN
        RAISE EXCEPTION
            'INT-05: Parámetros inválidos.';
    END IF;

    SELECT e.proyecto_id
    INTO v_origen
    FROM public.etapas e
    WHERE e.id = p_etapa_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'INT-05: La etapa no existe.';
    END IF;

    IF v_origen = p_proyecto_destino_id THEN
        RAISE EXCEPTION
            'INT-05: Origen y destino son iguales.';
    END IF;

    -- Bloquear proyectos individualmente y en orden.
    FOR v_id IN
        SELECT p.id
        FROM public.proyectos p
        WHERE p.id IN (
            v_origen,
            p_proyecto_destino_id
        )
        ORDER BY p.id
    LOOP
        PERFORM 1
        FROM public.proyectos p
        WHERE p.id = v_id
        FOR UPDATE;
    END LOOP;

    IF NOT EXISTS (
        SELECT 1
        FROM public.proyectos p
        WHERE p.id = p_proyecto_destino_id
    ) THEN
        RAISE EXCEPTION
            'INT-05: El proyecto destino no existe.';
    END IF;

    -- Comprobar nuevamente el origen tras los bloqueos.
    SELECT e.proyecto_id
    INTO v_origen_actual
    FROM public.etapas e
    WHERE e.id = p_etapa_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_origen_actual IS DISTINCT FROM v_origen
    THEN
        RAISE EXCEPTION
            'INT-05: La etapa cambió durante el traslado. Reintente.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.etapas e
        WHERE e.proyecto_id = p_proyecto_destino_id
          AND e.orden = p_nuevo_orden
    ) THEN
        RAISE EXCEPTION
            'INT-05: El orden destino ya está ocupado.';
    END IF;

    -- Autorización privada, específica y de un solo uso.
    INSERT INTO gemwork_interno.autorizaciones_traslado (
        transaccion_id,
        tipo_objeto,
        objeto_id,
        origen_id,
        destino_id
    )
    VALUES (
        pg_current_xact_id()::text::bigint,
        'etapa',
        p_etapa_id,
        v_origen,
        p_proyecto_destino_id
    )
    RETURNING id INTO v_autorizacion;

    UPDATE public.etapas
    SET proyecto_id = p_proyecto_destino_id,
        orden = p_nuevo_orden
    WHERE id = p_etapa_id
      AND proyecto_id = v_origen;

    GET DIAGNOSTICS v_filas = ROW_COUNT;

    IF v_filas <> 1 THEN
        RAISE EXCEPTION
            'INT-05: No se pudo completar el traslado.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM gemwork_interno.autorizaciones_traslado a
        WHERE a.id = v_autorizacion
    ) THEN
        RAISE EXCEPTION
            'INT-05: La autorización no fue consumida.';
    END IF;

    -- Los triggers diferidos validarán ambos proyectos
    -- al confirmar la transacción.
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_trasladar_tarea_controlado(p_tarea_id uuid, p_etapa_destino_id uuid, p_nuevo_orden integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_etapa_origen UUID;
    v_etapa_actual UUID;
    v_proyecto_origen UUID;
    v_proyecto_destino UUID;
    v_proyecto_actual UUID;
    v_id UUID;
    v_autorizacion UUID;
    v_filas INTEGER;
BEGIN
    PERFORM gemwork_bk03506.lock_writes();
    -- Identidad y autorización.
    IF auth.uid() IS NULL
       OR NOT public.fn_es_administrador_activo()
    THEN
        RAISE EXCEPTION
            'INT-05: Se requiere un administrador activo.'
            USING ERRCODE = '42501';
    END IF;

    IF p_tarea_id IS NULL
       OR p_etapa_destino_id IS NULL
       OR p_nuevo_orden IS NULL
       OR p_nuevo_orden <= 0
    THEN
        RAISE EXCEPTION
            'INT-05: Parámetros inválidos.';
    END IF;

    SELECT t.etapa_id
    INTO v_etapa_origen
    FROM public.tareas t
    WHERE t.id = p_tarea_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'INT-05: La tarea no existe.';
    END IF;

    IF v_etapa_origen = p_etapa_destino_id THEN
        RAISE EXCEPTION
            'INT-05: Origen y destino son iguales.';
    END IF;

    SELECT e.proyecto_id
    INTO v_proyecto_origen
    FROM public.etapas e
    WHERE e.id = v_etapa_origen;

    SELECT e.proyecto_id
    INTO v_proyecto_destino
    FROM public.etapas e
    WHERE e.id = p_etapa_destino_id;

    IF v_proyecto_origen IS NULL
       OR v_proyecto_destino IS NULL
    THEN
        RAISE EXCEPTION
            'INT-05: Etapa de origen o destino inexistente.';
    END IF;

    -- Bloquear proyectos en orden determinista.
    FOR v_id IN
        SELECT p.id
        FROM public.proyectos p
        WHERE p.id IN (
            v_proyecto_origen,
            v_proyecto_destino
        )
        ORDER BY p.id
    LOOP
        PERFORM 1
        FROM public.proyectos p
        WHERE p.id = v_id
        FOR UPDATE;
    END LOOP;

    -- Proteger ambas etapas frente a traslados simultáneos.
    FOR v_id IN
        SELECT e.id
        FROM public.etapas e
        WHERE e.id IN (
            v_etapa_origen,
            p_etapa_destino_id
        )
        ORDER BY e.id
    LOOP
        PERFORM 1
        FROM public.etapas e
        WHERE e.id = v_id
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'INT-05: Una etapa dejó de existir.';
        END IF;
    END LOOP;

    -- Revalidar pertenencia a proyectos.
    SELECT e.proyecto_id
    INTO v_proyecto_actual
    FROM public.etapas e
    WHERE e.id = v_etapa_origen;

    IF v_proyecto_actual IS DISTINCT FROM v_proyecto_origen THEN
        RAISE EXCEPTION
            'INT-05: El origen cambió. Reintente.';
    END IF;

    SELECT e.proyecto_id
    INTO v_proyecto_actual
    FROM public.etapas e
    WHERE e.id = p_etapa_destino_id;

    IF v_proyecto_actual IS DISTINCT FROM v_proyecto_destino THEN
        RAISE EXCEPTION
            'INT-05: El destino cambió. Reintente.';
    END IF;

    SELECT t.etapa_id
    INTO v_etapa_actual
    FROM public.tareas t
    WHERE t.id = p_tarea_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_etapa_actual IS DISTINCT FROM v_etapa_origen
    THEN
        RAISE EXCEPTION
            'INT-05: La tarea cambió durante el traslado.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.tareas t
        WHERE t.etapa_id = p_etapa_destino_id
          AND t.orden = p_nuevo_orden
    ) THEN
        RAISE EXCEPTION
            'INT-05: El orden destino ya está ocupado.';
    END IF;

    INSERT INTO gemwork_interno.autorizaciones_traslado (
        transaccion_id,
        tipo_objeto,
        objeto_id,
        origen_id,
        destino_id
    )
    VALUES (
        pg_current_xact_id()::text::bigint,
        'tarea',
        p_tarea_id,
        v_etapa_origen,
        p_etapa_destino_id
    )
    RETURNING id INTO v_autorizacion;

    UPDATE public.tareas
    SET etapa_id = p_etapa_destino_id,
        orden = p_nuevo_orden
    WHERE id = p_tarea_id
      AND etapa_id = v_etapa_origen;

    GET DIAGNOSTICS v_filas = ROW_COUNT;

    IF v_filas <> 1 THEN
        RAISE EXCEPTION
            'INT-05: No se pudo completar el traslado.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM gemwork_interno.autorizaciones_traslado a
        WHERE a.id = v_autorizacion
    ) THEN
        RAISE EXCEPTION
            'INT-05: La autorización no fue consumida.';
    END IF;

    -- Validación diferida de ponderaciones al COMMIT.
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_cambiar_estado_mi_notificacion(
  p_notificacion_id uuid, p_estado_nombre text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = '' AS $fn$
DECLARE
  v_actor uuid;
  v_current text;
  v_target public.estado_notificacion.id%TYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  -- Bloquea cambios concurrentes del perfil mientras se verifica su vigencia.
  SELECT u.id INTO v_actor FROM public.usuarios AS u
  JOIN public.estado_usuario AS s ON s.id = u.estado_usuario_id
  WHERE u.auth_user_id = auth.uid() AND s.nombre = 'Activo' FOR SHARE OF u;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_estado_nombre IS NULL OR p_estado_nombre NOT IN ('No leída','Leída','Archivada') THEN RETURN false; END IF;

  SELECT s.nombre INTO v_current FROM public.notificaciones AS n
  JOIN public.estado_notificacion AS s ON s.id = n.estado_notificacion_id
  WHERE n.id = p_notificacion_id AND n.usuario_id = v_actor FOR UPDATE OF n;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_current = p_estado_nombre THEN RETURN true; END IF;
  IF NOT coalesce(
    (v_current = 'No leída' AND p_estado_nombre IN ('Leída', 'Archivada'))
    OR (v_current = 'Leída' AND p_estado_nombre = 'Archivada'), false
  ) THEN RETURN false; END IF;

  SELECT s.id INTO STRICT v_target FROM public.estado_notificacion AS s WHERE s.nombre = p_estado_nombre;
  UPDATE public.notificaciones AS n SET estado_notificacion_id = v_target,
    leida_en = CASE WHEN p_estado_nombre = 'Leída'
      THEN coalesce(n.leida_en, greatest(n.creado_en, pg_catalog.clock_timestamp()))
      ELSE n.leida_en END
  WHERE n.id = p_notificacion_id AND n.usuario_id = v_actor;
  RETURN FOUND;
END;
$fn$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA gemwork_bk03506 FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_cambiar_estado_tarea(uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_cambiar_estado_tarea(uuid,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_modificar_cronograma(text,uuid,date,date,date,date,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_modificar_cronograma(text,uuid,date,date,date,date,text) TO authenticated;
-- Las tres RPC sustituidas conservan propietario y ACL por CREATE OR REPLACE.
COMMIT;
