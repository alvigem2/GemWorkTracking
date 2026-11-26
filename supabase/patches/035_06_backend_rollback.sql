-- 35.6.2. Reversión del borrador candidato. No ejecutar.
BEGIN;

DO $rollback$
DECLARE
  v_original text;
BEGIN
  IF current_user <> 'postgres' OR pg_catalog.to_regclass('gemwork_bk03506.original_rpc') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Falta la definición original de la RPC de notificaciones';
  END IF;
  IF (SELECT count(*) FROM gemwork_bk03506.original_rpc) <> 3 THEN
    RAISE EXCEPTION 'Respaldo incompleto de las RPC';
  END IF;
  FOR v_original IN SELECT definition FROM gemwork_bk03506.original_rpc LOOP
    EXECUTE v_original;
  END LOOP;
END;
$rollback$;

-- Retirar primero todos los triggers nuevos y luego sus funciones y tablas.
DROP TRIGGER gw03506_audit ON public.proyectos;
DROP TRIGGER gw03506_audit ON public.etapas;
DROP TRIGGER gw03506_audit ON public.tareas;
DROP TRIGGER gw03506_audit ON public.usuarios;
DROP TRIGGER gw03506_audit ON public.clientes;
DROP TRIGGER gw03506_audit ON public.documentos;
DROP TRIGGER gw03506_audit ON public.proyecto_usuario_cliente;
DROP TRIGGER gw03506_audit ON public.tarea_desarrollador;
DROP TRIGGER gw03506_notify ON public.tareas;
DROP TRIGGER gw03506_notify ON public.documentos;
DROP TRIGGER gw03506_notify ON public.tarea_desarrollador;
DROP TRIGGER gw03506_schedule ON public.proyectos;
DROP TRIGGER gw03506_schedule ON public.etapas;
DROP TRIGGER gw03506_schedule ON public.tareas;
DROP TRIGGER gw03506_lock ON public.documentos;
DROP TRIGGER gw03506_admin ON public.usuarios;
DROP TRIGGER gw03506_self ON public.usuarios;
DROP TRIGGER gw03506_project ON public.proyectos;
DROP TRIGGER gw03506_work ON public.tareas;
DROP TRIGGER gw03506_work ON public.etapas;
DROP TRIGGER gw03506_lock ON public.tarea_desarrollador;
DROP TRIGGER gw03506_lock ON public.proyecto_usuario_cliente;
DROP TRIGGER gw03506_lock ON public.usuarios;
DROP TRIGGER gw03506_lock ON public.tareas;
DROP TRIGGER gw03506_lock ON public.etapas;
DROP TRIGGER gw03506_lock ON public.proyectos;

DROP FUNCTION public.fn_modificar_cronograma(text,uuid,date,date,date,date,text);
DROP FUNCTION gemwork_bk03506.guard_schedule();
DROP FUNCTION gemwork_bk03506.notify_row();
DROP FUNCTION gemwork_bk03506.notify_event(text,uuid,uuid,uuid,uuid,uuid);
DROP FUNCTION gemwork_bk03506.audit_row();
DROP FUNCTION gemwork_bk03506.audit_event(text,text,uuid,jsonb,jsonb);
DROP FUNCTION public.fn_cambiar_estado_tarea(uuid,text,text);
DROP FUNCTION gemwork_bk03506.keep_active_admin();
DROP FUNCTION gemwork_bk03506.guard_self();
DROP FUNCTION gemwork_bk03506.guard_project();
DROP FUNCTION gemwork_bk03506.guard_work();
DROP FUNCTION gemwork_bk03506.check_task_transition(text,text);
DROP FUNCTION gemwork_bk03506.before_write();
DROP FUNCTION gemwork_bk03506.active_actor();
DROP FUNCTION gemwork_bk03506.lock_writes();

DROP TABLE gemwork_bk03506.schedule_write;
DROP TABLE gemwork_bk03506.original_rpc;
DROP TABLE gemwork_bk03506.task_transition;
DROP SCHEMA gemwork_bk03506;
COMMIT;
