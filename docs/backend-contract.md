# Contrato de backend de GemWork Tracking

## Evidencia disponible

- El frontend muestra qué consultas y escrituras están implementadas. Son contratos de cliente y no demuestran por sí solos qué autoriza el backend. Se revisaron `authService.ts`, `usersService.ts`, `projectsService.ts`, `projectWorkService.ts`, `assignmentsService.ts`, `documentsService.ts`, `notificationsService.ts` y `auditService.ts`.
- En fases anteriores, PostgREST aceptó las proyecciones y relaciones indicadas abajo. Los catálogos sin filas visibles y la lista vacía de buckets con acceso público no acreditan ausencia de datos, permisos ni infraestructura.
- La fase 35.6.2 verificó directamente mediante Supabase MCP las definiciones y permisos que afectan el parche, en el proyecto `sciimuwokzdhyqisiyma` y con `read_only=true`. Las demás referencias a fases anteriores se conservan como evidencia histórica. La matriz describe el contrato vigente y la sección 35.6.2 detalla el candidato local.
- Los parches SQL de 35.6.2 son locales. El código desplegado de las dos Edge Functions se consultó mediante MCP. La consulta de catálogo se limitó a metadatos y catálogos funcionales.

## Matriz de operaciones

**A** significa soportada por el contrato observado o documentado en la fase indicada. **B** significa que falta evidencia de una regla, permiso o mecanismo. **C** requiere una prohibición explícita. Los nombres de campo entre paréntesis en las filas B indican columnas que el frontend ya conoce, no un payload de escritura aprobado.

| Clasificación y operación | Rol y mecanismo | Campos, reglas y resultado | Evidencia |
| --- | --- | --- | --- |
| **A · Leer proyectos, etapas y tareas** | Administrador y roles con acceso bajo RLS. Lecturas en `proyectos`, `etapas` y `tareas`. Cliente se acota por `proyecto_usuario_cliente.usuario_id` y Desarrollador por `tarea_desarrollador.desarrollador_id`. | Devuelve las filas y catálogos visibles. Para proyectos, se documentó la política SELECT `rls_proyectos_select` con `fn_puede_ver_proyecto(id)`. | Consultas existentes y relaciones aceptadas por PostgREST. La cobertura por rol depende de RLS. |
| **A · Editar campos generales del proyecto** | Administrador activo. UPDATE por `proyectos.id`, con política documentada `rls_proyectos_update_admin` y `fn_es_administrador_activo()` en USING y WITH CHECK. | Payload actual `nombre, descripcion, cliente_id, fecha_inicio, fecha_fin_estimada`. Se requiere devolver el ID esperado. Exclusión de estado y fecha real. | Política documentada en 5B y contrato de edición en `projectsService.ts`. Quedan por comprobar permisos por columna y el registro de motivo de cambios de fechas. |
| **A · Crear una cuenta** | Administrador activo. Edge Function `gemwork-admin-usuarios`, POST. | JSON `nombre_completo, nombre_usuario, password, rol, telefono?`. Roles documentados `Administrador`, `Desarrollador`, `Cliente`. HTTP 201. La función crea la cuenta Auth y el perfil, según el contrato aportado. | Contrato documentado en 7B.2 y llamada actual de `usersService.ts`. Sin fuente desplegada local. |
| **A · Consultar documentos, notificaciones y trazabilidad** | Sesión autenticada y RLS. Notificaciones por `usuario_id` del perfil. Historial por proyecto directo, etapa o tarea. | Solo lectura. Se muestran catálogos y relaciones visibles. El historial usa `modificado_en`; la bitácora usa `fecha_evento`. | Proyecciones de PostgREST aceptadas en fases previas y servicios actuales. |
| **A · Iniciar proyecto** | Administrador activo. UPDATE directo bajo rls_proyectos_update_admin. | Iniciado → En curso. Envía estado_proyecto_id y condiciona por ID y estado anterior. | Contrato 35.2. trg_validar_inicio_ejecucion valida ponderaciones. |
| **A · Cerrar proyecto** | Administrador activo. UPDATE directo bajo rls_proyectos_update_admin. | En curso → Terminado. Envía estado_proyecto_id y fecha_fin_real en la misma operación. | Contrato 35.2. El trigger comprueba ponderaciones, pero no garantiza que todas las tareas estén completadas. |
| **A · Cambiar estado de tarea como Administrador** | UPDATE directo con rls_tareas_update_admin y fn_es_administrador_activo(). | Solo estado_tarea_id, con ID y estado anterior en el filtro. | Contrato 35.2. La matriz de transición se aplica en la interfaz. |
| **C · Cambiar estado de tarea como Desarrollador** | Sin política UPDATE de tareas ni RPC autorizada. | Solo lectura para tareas asignadas. | Contrato 35.2. Requiere una operación de backend expresamente autorizada. |
| **A · Subir, visualizar y descargar PDF** | Carga por Administrador activo. Consulta y descarga bajo RLS de documentos y Storage. | Bucket privado `documentos`, máximo 20 MiB, ruta UUID por proyecto y documento. La carga requiere registrar primero el borrador. | Contrato documentado en 35.3. Prueba autenticada de extremo a extremo pendiente. |
| **A · Publicar y retirar publicación** | Administrador activo. UPDATE bajo RLS. | Borrador → Publicado → Retirado. El retiro conserva el objeto y mantiene los datos históricos. | Contrato documentado en 35.3. Conservación de campos históricos confirmada en 35.4. |
| **A · Leer y archivar notificaciones propias** | Los tres roles, mediante `fn_cambiar_estado_mi_notificacion`. | `Leída` o `Archivada`. Se confirma el resultado booleano de cada llamada. | Contrato confirmado en 35.4. |
| **A · Activar o desactivar una cuenta** | UPDATE por Administrador activo bajo `rls_usuarios_update_admin`. | Cambia solo `estado_usuario_id`, con condición de ID, estado previo y rol. Confirma la fila devuelta y el nuevo estado. | Contrato aportado en 35.5. Las protecciones de interfaz y sus límites se detallan abajo. |
| **C · Desactivar o cambiar de rol a Cliente/Desarrollador con asignaciones** | Denegada por INT-06B en el trigger documentado, incluso para Administrador. | El cambio debe rechazarse mientras existan asignaciones. | Regla confirmada por la evidencia aportada en 7C.5. MCP confirmó el trigger y que la validación de nuevas asignaciones bloquea al destinatario antes de verificar rol y estado. |
| **B · Editar fechas con motivo trazable** | Administrador. Determinar si hay RPC, contexto de transacción u otra operación existente. | Registrar fechas anteriores y nuevas, entidad, responsable y motivo. Confirmar si la edición actual es válida o requiere otro mecanismo. | `historial_cronograma.motivo` confirmado. Los UPDATE actuales envían fechas, pero no envían motivo ni invocan una RPC para registrarlo. |

## Funciones, políticas, triggers y Storage

- **Proyectos.** SELECT según fn_puede_ver_proyecto(id). UPDATE confirmado para Administrador activo, con validación de ponderaciones en el trigger de ejecución. La fecha real se envía al cerrar y debe ser igual o posterior al inicio.
- **Tareas.** UPDATE directo confirmado para Administrador activo. La asignación permite consultar según RLS. El contrato 35.2 confirma que Desarrollador carece de política UPDATE y de RPC autorizada para cambiar el estado.
- **Usuarios.** SELECT de perfil propio o Administrador activo. UPDATE de estado documentado en 35.5. La sección de administración de estados describe el trigger y la revalidación de sesiones.
- **Documentos.** El contrato aportado en 35.3 confirma el bucket privado, los catálogos y el orden requerido de escritura. Véase la sección siguiente.
- **Notificaciones.** SELECT limitado al propietario por `rls_notificaciones_select`. Los cambios de estado se realizan mediante la RPC documentada en 35.4.
- **Bitácora e historial.** Confirmados `bitacora`, `tipo_evento_bitacora` e `historial_cronograma`. Sus servicios actuales son de lectura. Queda por confirmar qué tablas y eventos se auditan, cómo se identifica al ejecutor y cómo se exige o propaga el motivo. La ausencia de motivo en el payload actual es verificable, pero no permite deducir qué guarda el trigger.
- **Edge Functions.** MCP confirmó el uso de `signInWithPassword` en `gemwork-login-ts`, y la validación del solicitante, creación Auth e inserción del perfil con cliente de servicio en `gemwork-admin-usuarios`. La integración posterior de auditoría se describe en la consolidación.


## Documentos y Storage · 35.3

- Bucket privado `documentos`, MIME `application/pdf`, máximo 20 971 520 bytes. La ruta es `{proyecto_id}/{documento_id}.pdf`, con identificadores UUID. El nombre original se conserva en `nombre_archivo` para la descarga.
- Los IDs de `Borrador`, `Publicado`, `Retirado`, `Interno` y `Cliente` se resuelven con los catálogos autenticados. `subido_por` y `publicado_por` utilizan `public.usuarios.id`.
- La carga valida nombre, MIME, extensión, tamaño y cabecera PDF. Inserta y confirma primero los metadatos en estado Borrador, como exige `gw_storage_documentos_insert`. Luego sube el PDF sin sobrescribir y confirma ambas respuestas. La validación de cabecera es básica.
- Ante un rechazo definitivo de la carga y una respuesta explícita de objeto inexistente, se intenta retirar exclusivamente el borrador recién creado. Una respuesta ambigua o una limpieza sin confirmar conserva la referencia y pide verificar el listado antes de reintentar.
- El Administrador activo puede publicar desde Borrador tras confirmar el alcance y verificar el objeto. El cambio registra responsable y fecha. Puede retirar desde Publicado, actualizando solo el estado. Ambos cambios filtran por el estado esperado y comprueban la fila devuelta.
- Administrador, Desarrollador y Cliente descargan mediante la sesión autenticada. El visor usa una URL local temporal. El Desarrollador consulta proyectos en los que participa. El Cliente consulta sus proyectos asignados y solo documentos Publicado con alcance Cliente. El permiso efectivo depende de `fn_puede_ver_documento(id)` y las políticas de Storage.
- El contrato exportado en 35.4 confirma `extension varchar(10) NOT NULL` y admite `pdf`. El retiro actualiza solo el estado y conserva `publicado_por` y `publicado_en`. La prueba autenticada de extremo a extremo sigue pendiente.


## Notificaciones internas · 35.4

- `public.fn_cambiar_estado_mi_notificacion(p_notificacion_id uuid, p_estado_nombre text) RETURNS boolean` es `SECURITY DEFINER`, usa `search_path` vacío y concede EXECUTE a `authenticated`. Resuelve al propietario con `fn_mi_usuario_id()` y bloquea la fila con `FOR UPDATE`. Devuelve `true` al actualizar y `false` si no encuentra una notificación propia.
- La RPC acepta `Leída` o `Archivada`. El servidor preserva `leida_en` cuando existe y asigna `now()` cuando es nulo. El frontend envía solo ID y nombre de estado. Las lecturas filtran adicionalmente por `public.usuarios.id`. El listado consulta los nombres reales de estado y tipo mediante relaciones con ambos catálogos.
- La bandeja utiliza `No leída`, `Leída` y `Archivada`. Todas agrupa los dos primeros estados y el contador incluye solo `No leída`. La interfaz trata `Archivada` como estado final provisional y habilita No leída → Leída o Archivada y Leída → Archivada.
- El marcado masivo pagina todas las notificaciones propias pendientes por ID y procesa hasta cuatro llamadas simultáneas. Es una operación no atómica. Comprueba que cada fila siga pendiente antes de pedir el cambio e informa los resultados parciales. Una sesión concurrente todavía puede cambiar el estado entre esa lectura y la RPC, cuya firma carece de un estado previo esperado.
- La navegación vuelve a comprobar el recurso bajo RLS. Administrador y Cliente abren el detalle del proyecto; Desarrollador abre el detalle de una tarea asignada. Un documento dirige a la sección correspondiente del proyecto cuando el rol dispone de ese destino.
- La generación automática y su relación con bitácora quedan para 35.6. Un tipo en el catálogo no demuestra que exista automatización. Queda pendiente una prueba autenticada de extremo a extremo.


## Administración de estados de usuario · 35.5

- Un Administrador activo puede cambiar entre `Activo` e `Inactivo` mediante UPDATE de `public.usuarios.estado_usuario_id`. `rls_usuarios_update_admin` aplica `fn_es_administrador_activo()` en USING y WITH CHECK. Los identificadores se resuelven en los catálogos de roles y estados. Se requiere que la fila devuelta tenga el ID y estado solicitados.
- La interfaz impide la autodesactivación por `public.usuarios.id`. Antes de confirmar la desactivación de otro administrador y antes del UPDATE, consulta el total real de administradores activos. Un fallo de consulta bloquea la acción. El conteo y la actualización son operaciones separadas. La protección definitiva del último administrador ante concurrencia y otros canales queda pendiente en 35.6.
- Para desactivar Clientes y Desarrolladores se comprueban `proyecto_usuario_cliente.usuario_id` y `tarea_desarrollador.desarrollador_id`, respectivamente. Si hay asignaciones se muestra el total y, para clientes, hasta cinco proyectos visibles. `fn_proteger_rol_estado_usuario()` aplica INT-06B en el servidor. Los selectores de nuevas asignaciones consultan perfiles activos al entrar al detalle del proyecto o recuperar el foco; las asignaciones históricas se conservan.
- El perfil se revalida al restaurar la sesión, al recuperar foco o conexión y al navegar por rutas protegidas. Un perfil confirmado inactivo o no disponible pierde acceso al panel y se solicita el cierre local de sesión. Los fallos transitorios conservan una sesión previamente validada. Supabase Auth y los mecanismos de bloqueo de Auth siguen siendo independientes del estado del perfil. La propagación a otras sesiones depende de sus siguientes comprobaciones y de las políticas existentes; no existe revocación global desde el navegador.
- La generación automática de eventos de activación y desactivación en bitácora queda para 35.6.

## Contrato desplegado verificado por MCP · 35.6.2

- Los traslados controlados tienen firmas `fn_trasladar_etapa_controlado(uuid,uuid,integer)` y `fn_trasladar_tarea_controlado(uuid,uuid,integer)`, retorno `void`, SECURITY DEFINER y `search_path` vacío. Bloquean los proyectos por UUID; la RPC de tarea bloquea también las etapas. `fn_proteger_traslados_directos()` consume una autorización de `gemwork_interno.autorizaciones_traslado` por transacción, objeto, origen y destino. Los triggers diferidos validan las ponderaciones. `fn_calcular_avance_proyecto(uuid)` pondera el avance de cada etapa y `fn_calcular_avance_etapa(uuid)` usa tareas Completada.
- `fn_proteger_rol_estado_usuario()` protege INT-06B al cambiar rol o estado; `fn_validar_asignacion_usuario()` ya toma `FOR NO KEY UPDATE` sobre el destinatario. Las relaciones usan PK compuestas `(proyecto_id,usuario_id)` y `(tarea_id,desarrollador_id)`, con FKs al perfil y a la entidad asignada.
- `historial_cronograma` exige proyecto, usuario, motivo de contenido no vacío, nombre de campo válido y dos fechas distintas, no nulas. `etapa_id` y `tarea_id` son opcionales y excluyentes. RLS concede SELECT a Administrador activo.
- `bitacora` admite actor NULL con FK a `usuarios`. Las imágenes anterior y posterior son objetos JSON o NULL. RLS concede SELECT a Administrador activo. `clientes` admite tipo Persona o Empresa y tiene trigger de fecha de modificación. MCP confirmó existencia de `Creación de cliente` y `Modificación de cliente` junto con los demás eventos. Activación y desactivación se consignan mediante `Modificación de usuario`.
- `notificaciones` exige destinatario, título de hasta 150 caracteres, mensaje, tipo y estado. El título y el mensaje deben contener texto; `leida_en` admite NULL y, cuando existe, es igual o posterior a `creado_en`. La política de lectura exige que el destinatario coincida con el perfil de la sesión. El catálogo confirma `No leída`, `Leída` y `Archivada`.
- `fn_puede_ver_proyecto(uuid)` resuelve Administrador activo, Cliente asignado directamente o Desarrollador relacionado por alguna tarea. `fn_puede_ver_documento(uuid)` permite al Administrador activo y, para documentos publicados, al Desarrollador del proyecto y al Cliente asignado cuando el alcance es Cliente. Ambas funciones resuelven al usuario de la sesión.
- `postgres` posee las tablas afectadas y tiene `BYPASSRLS`; RLS está activa y sin FORCE en las tablas revisadas. Las tres RPC que se sustituyen tienen EXECUTE para `postgres` y `authenticated` y pertenecen a `postgres`.

## Contrato candidato local · 35.6.2

Las dos RPC nuevas concentran los cambios de estado de tareas y fechas planificadas. El candidato conserva las RPC de traslado controlado y de notificaciones propias con sus firmas. Añade controles de proyecto y administrador activo, bitácora por operación efectiva, historial obligatorio y avisos inmediatos. La matriz de integración, los permisos, los criterios de aceptación y el procedimiento de instalación y reversión se detallan en [backend-consolidation.md](backend-consolidation.md).

## Consulta histórica para Supabase SQL Editor

Esta consulta documenta el mecanismo de verificación de fases anteriores. Para una comprobación manual autorizada, ejecutar el SELECT como consulta de metadatos en el proyecto correcto y conservar el resultado de forma privada. Incluye definiciones de funciones para estudiar reglas y dependencias. Revisar y censurar cualquier literal sensible antes de compartirlas. La consulta lee catálogos de estados, no usuarios, objetos de Storage ni registros de auditoría. Una lectura desde SQL Editor confirma definiciones, pero no reproduce el contexto JWT de cada rol.

```sql
WITH
target(schema_name, table_name) AS (VALUES
  ('public','proyectos'), ('public','etapas'), ('public','tareas'),
  ('public','documentos'), ('public','notificaciones'), ('public','usuarios'),
  ('public','proyecto_usuario_cliente'), ('public','tarea_desarrollador'),
  ('public','bitacora'), ('public','historial_cronograma'),
  ('public','roles'), ('public','estado_usuario'), ('public','estado_proyecto'),
  ('public','estado_tarea'), ('public','estado_documento'),
  ('public','alcance_documento'), ('public','tipo_notificacion'),
  ('public','estado_notificacion'), ('public','tipo_evento_bitacora'),
  ('storage','objects'), ('storage','buckets')
),
relations AS (
  SELECT c.oid, n.nspname AS schema_name, c.relname AS table_name,
         c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN target t ON t.schema_name = n.nspname AND t.table_name = c.relname
),
app_roles(rol) AS (VALUES ('authenticated'), ('anon')),
columns AS (
  SELECT r.schema_name, r.table_name, a.attname AS column_name,
         format_type(a.atttypid, a.atttypmod) AS data_type,
         a.attnotnull AS not_null, pg_get_expr(d.adbin, d.adrelid) AS default_value,
         a.attgenerated AS generated, a.attidentity AS identity_type
  FROM relations r JOIN pg_attribute a ON a.attrelid = r.oid
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attnum > 0 AND NOT a.attisdropped
),
permissions AS (
  SELECT r.schema_name, r.table_name, ar.rol,
         has_schema_privilege(ar.rol, r.schema_name, 'USAGE') AS schema_usage,
         has_table_privilege(ar.rol, r.oid, 'SELECT') AS table_select,
         has_table_privilege(ar.rol, r.oid, 'INSERT') AS table_insert,
         has_table_privilege(ar.rol, r.oid, 'UPDATE') AS table_update,
         has_table_privilege(ar.rol, r.oid, 'DELETE') AS table_delete,
         array_agg(a.attname ORDER BY a.attnum) FILTER (
           WHERE has_column_privilege(ar.rol, r.oid, a.attnum, 'SELECT')) AS select_columns,
         array_agg(a.attname ORDER BY a.attnum) FILTER (
           WHERE has_column_privilege(ar.rol, r.oid, a.attnum, 'INSERT')) AS insert_columns,
         array_agg(a.attname ORDER BY a.attnum) FILTER (
           WHERE has_column_privilege(ar.rol, r.oid, a.attnum, 'UPDATE')) AS update_columns
  FROM relations r CROSS JOIN app_roles ar
  JOIN pg_attribute a ON a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped
  GROUP BY r.schema_name, r.table_name, r.oid, ar.rol
),
policies AS (
  SELECT p.* FROM pg_policies p
  JOIN target t ON t.schema_name = p.schemaname AND t.table_name = p.tablename
),
constraints AS (
  SELECT r.schema_name, r.table_name, c.conname, c.contype,
         pg_get_constraintdef(c.oid, true) AS definition
  FROM relations r JOIN pg_constraint c ON c.conrelid = r.oid
),
trigger_inventory AS MATERIALIZED (
  SELECT n.nspname AS schema_name, c.relname AS table_name, t.tgname, t.tgenabled,
         t.tgfoid, pg_get_triggerdef(t.oid, true) AS definition
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE NOT t.tgisinternal AND n.nspname IN ('public','storage','auth')
),
functions AS MATERIALIZED (
  SELECT p.oid, n.nspname AS schema_name, p.proname AS name,
         pg_get_function_identity_arguments(p.oid) AS identity_args,
         pg_get_function_arguments(p.oid) AS arguments,
         pg_get_function_result(p.oid) AS return_type,
         p.prosecdef AS security_definer, p.proconfig AS configuration,
         pg_get_userbyid(p.proowner) AS owner, p.prosrc AS source
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prokind IN ('f','p')
    AND (n.nspname = 'public' OR p.oid IN (SELECT tgfoid FROM trigger_inventory))
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d
      WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid
        AND d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e'
    )
),
relevant_triggers AS (
  SELECT t.* FROM trigger_inventory t
  WHERE EXISTS (SELECT 1 FROM target x WHERE x.schema_name = t.schema_name AND x.table_name = t.table_name)
     OR EXISTS (SELECT 1 FROM functions f WHERE f.oid = t.tgfoid
       AND (f.name || ' ' || f.source) ~* '(bitacora|auditor|notificaci|historial_cronograma)')
),
relevant_functions AS (
  SELECT f.* FROM functions f
  WHERE f.oid IN (SELECT tgfoid FROM relevant_triggers)
     OR (f.name || ' ' || f.source) ~* '(proyecto|tarea|etapa|pondera|avance|document|notificaci|leida_en|usuario|administrador|asignaci|cronograma|bitacora|auditor|storage)'
),
function_contracts AS (
  SELECT schema_name, name, identity_args, arguments, return_type, owner, security_definer, configuration,
         has_function_privilege('authenticated', oid, 'EXECUTE') AS authenticated_execute,
         has_function_privilege('anon', oid, 'EXECUTE') AS anon_execute,
         pg_get_functiondef(oid) AS definition
  FROM relevant_functions
),
catalogs AS (
  SELECT 'estado_proyecto' AS catalog, id::text, nombre FROM public.estado_proyecto
  UNION ALL SELECT 'estado_tarea', id::text, nombre FROM public.estado_tarea
  UNION ALL SELECT 'estado_documento', id::text, nombre FROM public.estado_documento
  UNION ALL SELECT 'alcance_documento', id::text, nombre FROM public.alcance_documento
  UNION ALL SELECT 'tipo_notificacion', id::text, nombre FROM public.tipo_notificacion
  UNION ALL SELECT 'estado_notificacion', id::text, nombre FROM public.estado_notificacion
  UNION ALL SELECT 'estado_usuario', id::text, nombre FROM public.estado_usuario
  UNION ALL SELECT 'roles', id::text, nombre FROM public.roles
  UNION ALL SELECT 'tipo_evento_bitacora', id::text, nombre FROM public.tipo_evento_bitacora
),
buckets AS (
  SELECT b.id, b.name, b.public,
         to_jsonb(b)->'file_size_limit' AS file_size_limit,
         to_jsonb(b)->'allowed_mime_types' AS allowed_mime_types
  FROM storage.buckets b
)
SELECT jsonb_build_object(
  'relations', COALESCE((SELECT jsonb_agg(r ORDER BY schema_name, table_name) FROM relations r), '[]'),
  'columns', COALESCE((SELECT jsonb_agg(c ORDER BY schema_name, table_name, column_name) FROM columns c), '[]'),
  'effective_privileges', COALESCE((SELECT jsonb_agg(p ORDER BY schema_name, table_name, rol) FROM permissions p), '[]'),
  'policies', COALESCE((SELECT jsonb_agg(p ORDER BY schemaname, tablename, policyname) FROM policies p), '[]'),
  'constraints', COALESCE((SELECT jsonb_agg(c ORDER BY schema_name, table_name, conname) FROM constraints c), '[]'),
  'triggers', COALESCE((SELECT jsonb_agg(t ORDER BY schema_name, table_name, tgname) FROM relevant_triggers t), '[]'),
  'functions', COALESCE((SELECT jsonb_agg(f ORDER BY schema_name, name, identity_args) FROM function_contracts f), '[]'),
  'catalogs', COALESCE((SELECT jsonb_agg(c ORDER BY catalog, nombre) FROM catalogs c), '[]'),
  'buckets', COALESCE((SELECT jsonb_agg(b ORDER BY id) FROM buckets b), '[]')
) AS backend_contract;
```

La consulta filtra funciones por términos y por triggers vinculados. Si una definición llama a una función auxiliar ausente, completar la lectura con `SELECT pg_get_functiondef('<esquema>.<función>(<tipos>)'::regprocedure);`, usando la firma real. Para una RPC, comprobar también que el esquema se expone en Data API y que su autorización interna corresponde al actor de aplicación. Para Storage, contrastar los predicados obtenidos con la convención en la Edge Function o la documentación existente. No se necesitan filas de `storage.objects`. Si el límite del bucket es nulo, revisar la configuración global en el Dashboard.

## Orden de integración

1. Verificar en un entorno autorizado las transiciones administrativas ya integradas. Confirmar el mecanismo para registrar el motivo de cambios de fechas.
2. Probar la propiedad y la navegación contextual con sesiones de los tres roles. Identificar los eventos que generan avisos en 35.6.
3. Verificar manualmente el flujo de documentos con sesiones de los tres roles.
4. Validar el flujo de estados con sesiones reales y resolver la protección transaccional del último administrador en 35.6.
5. Reconciliar la bitácora con el historial de fechas. Si los contratos anteriores requieren registrar un motivo, integrar ese dato por la vía existente.

No hay evidencia suficiente para recomendar un cambio de backend concreto. Si las definiciones demuestran que falta una operación, documentar el bloqueo exacto y revisar una propuesta separada antes de alterar Supabase.

## Contrato confirmado en la fase 35.2

Los estados de tareas son **Pendiente**, **En curso**, **Bloqueada** y **Completada**. Los de proyecto son **Iniciado**, **En curso** y **Terminado**. El frontend resuelve IDs por nombre en los catálogos autenticados.

- `fn_calcular_avance_etapa(p_etapa_id uuid)` y `fn_calcular_avance_proyecto(p_proyecto_id uuid)` devuelven numeric. Ambas permiten EXECUTE a authenticated y usan SECURITY INVOKER bajo RLS. La primera suma el peso de tareas Completada. La segunda pondera por etapa y redondea a dos decimales. El listado calcula localmente y el detalle permite contrastar con las RPC sin hacer una llamada por fila.
- `fn_validar_ponderaciones_proyecto(p_proyecto_id uuid)` devuelve `es_valido` y `mensaje` y permite EXECUTE a authenticated. El panel la llama antes de iniciar o finalizar. `trg_validar_inicio_ejecucion` vuelve a comprobar ponderaciones al pasar a En curso o Terminado. Los pesos usan numeric(5,2), son mayores que cero y deben sumar 100 % en cada nivel.
- La interfaz permite Iniciado → En curso y En curso → Terminado. Para cerrar, exige todas las tareas en Completada y avance real de 100 %. Solicita la fecha real, inicializada con el día de La Paz. No se identificó un trigger que la establezca. Las transiciones y el cierre por completitud no están garantizados íntegramente en PostgreSQL.
- La matriz provisional de tareas para Administrador permite Pendiente → En curso, En curso → Bloqueada, Bloqueada → En curso y En curso → Completada. No se identificó un trigger que imponga esa matriz. Las tareas Completada no se reabren desde esta interfaz. Desarrollador y Cliente conservan acceso de solo lectura.
