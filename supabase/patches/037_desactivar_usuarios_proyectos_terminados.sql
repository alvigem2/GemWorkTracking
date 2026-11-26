BEGIN;

DO $check$
BEGIN
  IF current_user <> 'postgres'
    OR to_regprocedure('gemwork_bk03506.lock_writes()') IS NULL
    OR to_regprocedure('public.fn_proteger_rol_estado_usuario()') IS NULL
    OR (SELECT count(*) FROM public.estado_proyecto WHERE nombre='Terminado') <> 1
  THEN
    RAISE EXCEPTION 'Se requiere el backend consolidado y el rol postgres';
  END IF;
END;
$check$;

-- El trigger existente conserva su identidad, propietario y permisos.
CREATE OR REPLACE FUNCTION public.fn_proteger_rol_estado_usuario()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_rol text;
  v_estado text;
BEGIN
  IF (NEW.rol_id,NEW.estado_usuario_id) IS NOT DISTINCT FROM (OLD.rol_id,OLD.estado_usuario_id) THEN
    RETURN NEW;
  END IF;
  SELECT nombre INTO STRICT v_rol FROM public.roles WHERE id=NEW.rol_id;
  SELECT nombre INTO STRICT v_estado FROM public.estado_usuario WHERE id=NEW.estado_usuario_id;

  IF EXISTS (
    SELECT 1
    FROM public.proyecto_usuario_cliente a
    JOIN public.proyectos p ON p.id=a.proyecto_id
    JOIN public.estado_proyecto s ON s.id=p.estado_proyecto_id
    WHERE a.usuario_id=OLD.id
      AND (v_rol<>'Cliente' OR (v_estado<>'Activo' AND s.nombre<>'Terminado'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE=
      'INT-06B: Conserva el rol de Cliente mientras existan asignaciones. Para desactivar la cuenta, sus proyectos asignados deben estar terminados o haberse retirado la asignación.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tarea_desarrollador a
    JOIN public.tareas t ON t.id=a.tarea_id
    JOIN public.etapas e ON e.id=t.etapa_id
    JOIN public.proyectos p ON p.id=e.proyecto_id
    JOIN public.estado_proyecto s ON s.id=p.estado_proyecto_id
    WHERE a.desarrollador_id=OLD.id
      AND (v_rol<>'Desarrollador' OR (v_estado<>'Activo' AND s.nombre<>'Terminado'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE=
      'INT-06B: Conserva el rol de Desarrollador mientras existan asignaciones. Para desactivar la cuenta, los proyectos de sus tareas asignadas deben estar terminados o haberse retirado la asignación.';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
