# Instalación del backend consolidado · 35.6.5

El usuario confirmó la instalación en el proyecto Supabase `sciimuwokzdhyqisiyma` mediante `035_06_backend_install.sql` y verificó cinco RPC instaladas con los permisos esperados, el esquema privado, 26 triggers activos y RLS en 11 tablas. El archivo fuente del parche conserva el bloqueo. Para esta instalación se autorizó la excepción al respaldo previo.

El frontend local está activo con `VITE_BACKEND_35_6=true`. Vite respondió en `http://127.0.0.1:5173/` y pasaron `npm run build` y `npm run lint`. Las secciones siguientes conservan el procedimiento de referencia y los casos de aceptación. Las pruebas con escrituras quedan pendientes.

## Respaldo previo a la instalación

Reutilizar [Respaldo PostgreSQL](../.github/workflows/postgres-backup.yml) y el procedimiento de [respaldos de PostgreSQL](postgres-backups.md). El workflow requiere GitHub Actions en la rama predeterminada, el entorno `postgres-backup`, Docker con `postgres:<versión mayor>-bookworm` (incluye `pg_dump`, `pg_restore` y `psql`), AWS CLI, OpenSSL y un bucket S3 privado ya disponible. Para esta instalación basta una ejecución manual autorizada.

- Variables: `BACKUP_ENABLED=true`, `BACKUP_PG_MAJOR`, `SUPABASE_DB_HOST`, `SUPABASE_DB_NAME`, `SUPABASE_DB_USER`, `SUPABASE_DB_CA_PEM`, `BACKUP_AWS_REGION`, `BACKUP_S3_BUCKET` y `BACKUP_S3_OWNER`. Confirmar que la configuración identifica el proyecto de destino. Usar conexión directa o pooler de sesión por el puerto 5432 y TLS `verify-full`.
- Secretos del entorno de GitHub: `SUPABASE_DB_PASSWORD`, `BACKUP_AWS_ACCESS_KEY_ID` y `BACKUP_AWS_SECRET_ACCESS_KEY`. Para generación local, usar el gestor de secretos o el mecanismo de autenticación privado ya autorizado. Mantener el archivo de respaldo fuera del repositorio.
- Alcance: esquema `public`, incluidos datos, funciones, triggers y RLS. La exportación deja fuera `gemwork_interno` (dependencia de INT-05), Auth, Storage, Edge Functions, roles, gestión de extensiones, publicaciones y suscripciones. Para recuperar en otro entorno, preparar por separado las dependencias que necesita el esquema. Incluyen los objetos de `gemwork_interno` y los UUID de Auth que exigen las FK. Si se necesita recuperar el PDF, incluir un procedimiento aparte para Storage.
- Generación: con escrituras pausadas, ejecutar **Actions → Respaldo PostgreSQL → Run workflow** en la rama predeterminada. Usar el bucket privado existente y mantener el bloque programado deshabilitado. El workflow usa el siguiente comando de generación. Si el workflow aún no está disponible, un operador autorizado puede reutilizar el mismo comando desde un entorno local privado con `PGHOST`, `PGPORT=5432`, `PGDATABASE`, `PGUSER`, `PGSSLMODE=verify-full` y `PGSSLROOTCERT` ya configurados, y con el cliente de la misma versión mayor que el servidor. Definir `BACKUP_FILE` como una ruta nueva en una ubicación privada fuera del repositorio.

```bash
pg_dump --no-password --format=custom --schema=public \
  --no-publications --no-subscriptions --lock-wait-timeout=30s \
  --file="$BACKUP_FILE"
```

- Integridad: confirmar éxito del job y el nombre, fecha y tamaño del objeto verificado, posterior a la pausa de escrituras. El workflow ejecuta `pg_restore --list`, comprueba que el catálogo contiene datos de tablas de `public`, lee el archivo completo con `pg_restore --file=/dev/null` y verifica tamaño, SHA-256 y cifrado AES256 mediante HEAD en S3. Para un archivo local, comprobar que el tamaño es mayor que cero, ejecutar esas mismas dos comprobaciones de `pg_restore` y registrar tamaño y SHA-256. En Windows, usar `NUL` como destino de descarte y `Get-FileHash -Algorithm SHA256` para el archivo local. Guardar el identificador de ejecución o la ubicación privada y el hash con el registro de instalación.
- Recuperación: descargar con una identidad autorizada y comprobar el SHA-256 contra los metadatos o el registro local. Preparar una base aislada compatible y sus dependencias. Revisar el catálogo de `pg_restore --list`, incluidos conflictos con objetos preexistentes, y ajustar la lista de restauración si corresponde. En el destino aislado validado, utilizar el comando de abajo. Reaplicar propietarios y permisos autorizados y validar FK, triggers, funciones con SECURITY DEFINER, RLS, perfiles Auth y acceso a objetos de Storage según la cobertura disponible. El rollback de la instalación restaura código y estructura de esta fase. La recuperación desde el respaldo es un procedimiento independiente.

```bash
pg_restore --dbname="$RECOVERY_DB" --exit-on-error --single-transaction \
  --no-owner --no-privileges respaldo.dump
```

## Instalación en SQL Editor

1. **Pausar escrituras.** Abrir una ventana de mantenimiento y detener todas las escrituras de la aplicación, incluidos clientes conectados, procesos programados, Edge Functions invocadas por la aplicación y otros escritores. Mantener `VITE_BACKEND_35_6` ausente o en `false`.
2. **Confirmar respaldo.** Completar el procedimiento previo y registrar la evidencia de integridad. Si la generación o la verificación falla, detener la instalación.
3. **Confirmar destino y sesión.** Abrir SQL Editor desde el proyecto cuyo identificador visible en el Dashboard sea `sciimuwokzdhyqisiyma`. Ejecutar la consulta de contexto de abajo. El rol esperado es `postgres`, con `rolbypassrls` verdadero e aislamiento `read committed`. Confirmar que la clave de bloqueo `(3506,1)` está reservada para este flujo y conservar la pausa de escrituras.
4. **Tras autorización expresa**, pegar el parche completo en una pestaña del SQL Editor del destino verificado. Solo en esa entrada de ejecución, retirar el bloque inicial desde `DO $review$` hasta `$review$;` inclusive. Conservar `BEGIN;`, `COMMIT;` y todas las precondiciones. El archivo del repositorio permanece bloqueado.
5. **Ejecutar toda la transacción una vez.** Si SQL Editor informa un error, conservarlo, confirmar que la transacción se revirtió y resolver la causa antes de un nuevo intento. Mantener el frontend con la bandera apagada hasta verificar una instalación confirmada.
6. **Comprobar el resultado.** Ejecutar las consultas de objetos y permisos de abajo. Esperar cinco RPC con propietario `postgres`, SECURITY DEFINER y acceso para `authenticated` sin EXECUTE para `anon` o `service_role`. Esperar 26 triggers habilitados, los siete bloqueos con TRUNCATE, el guard propio con UPDATE y DELETE y tres definiciones originales en el respaldo privado. Verificar también acceso denegado a las rutinas internas para los roles de API.
7. **Cambiar el frontend local controlado.** Establecer `VITE_BACKEND_35_6=true` en `.env.local` o en el entorno de Vite. Detener y volver a iniciar `npm run dev`. Una compilación previa debe reconstruirse para leer el valor nuevo.
8. **Validar y reabrir.** Limitar las escrituras a las cuentas de prueba autorizadas durante las pruebas de aceptación. Reabrir el flujo normal después de que pasen las comprobaciones. Si aparece un fallo que exige revertir, mantener la pausa y seguir la sección de reversión.

### Consultas de comprobación

Contexto antes de ejecutar el parche.

```sql
SELECT current_user, current_database(),
       current_setting('transaction_isolation') AS isolation,
       (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass_rls;
```

Objetos y permisos después de confirmar la transacción.

```sql
WITH expected(signature) AS (
  VALUES
    ('public.fn_cambiar_estado_tarea(uuid,text,text)'),
    ('public.fn_modificar_cronograma(text,uuid,date,date,date,date,text)'),
    ('public.fn_trasladar_etapa_controlado(uuid,uuid,integer)'),
    ('public.fn_trasladar_tarea_controlado(uuid,uuid,integer)'),
    ('public.fn_cambiar_estado_mi_notificacion(uuid,text)')
)
SELECT signature, p.oid IS NOT NULL AS installed, pg_get_userbyid(p.proowner) AS owner,
       pg_get_function_arguments(p.oid) AS arguments,
       pg_get_function_result(p.oid) AS result, p.prosecdef, p.proconfig,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute
FROM expected
LEFT JOIN pg_proc p ON p.oid = to_regprocedure(signature);

SELECT count(*) AS triggers,
       count(*) FILTER (WHERE tgenabled IN ('O','A')) AS enabled,
       count(*) FILTER (WHERE tgname='gw03506_lock'
         AND pg_get_triggerdef(oid) LIKE '%TRUNCATE%') AS truncate_guards,
       count(*) FILTER (WHERE tgname='gw03506_self'
         AND (tgtype & 24) = 24) AS self_guard
FROM pg_trigger
WHERE NOT tgisinternal AND left(tgname, 8) = 'gw03506_';

SELECT count(*) AS definitions_for_rollback FROM gemwork_bk03506.original_rpc;

SELECT r.role_name, has_schema_privilege(r.role_name,'gemwork_bk03506','USAGE') AS schema_usage,
       count(p.oid) FILTER (WHERE has_function_privilege(r.role_name,p.oid,'EXECUTE')) AS internal_execute
FROM (VALUES ('anon'),('authenticated'),('service_role')) r(role_name)
CROSS JOIN pg_proc p
WHERE p.pronamespace='gemwork_bk03506'::regnamespace
GROUP BY r.role_name;
```

### Pruebas funcionales posteriores

1. Iniciar un proyecto configurado con etapas, tareas, fechas válidas y sumas de pesos correctas. Verificar rechazo con estructura incompleta.
2. Cambiar una tarea por un administrador activo. Comprobar el rechazo de un estado anterior desactualizado.
3. Cambiar una tarea por su desarrollador activo asignado. Comprobar el rechazo para un desarrollador sin asignación.
4. Confirmar que Cliente puede consultar lo autorizado y carece de cambios de estado.
5. Completar una tarea y comprobar los porcentajes ponderados de su etapa y proyecto.
6. Modificar ambas fechas de un cronograma con motivo. Confirmar el nuevo intervalo en el Gantt y el avance planificado.
7. Confirmar una fila de historial por fecha modificada y ninguno cuando no cambia el intervalo.
8. Verificar una entrada de bitácora con el actor real y valores permitidos para una edición. Confirmar el alta mediante Edge Function y verificar que admite actor NULL cuando corresponde.
9. Verificar avisos a los destinatarios previstos y transición de lectura o archivo, incluido archivo sin fecha de lectura.
10. Publicar un documento autorizado. Confirmar que un documento interno no envía avisos a clientes.
11. Cerrar un proyecto con tareas completadas, 100 % de avance y fecha efectiva válida. Comprobar el rechazo si la fecha es futura.
12. Verificar que un administrador activo no puede desactivarse, cambiar su rol ni eliminar su perfil. En un ensayo con escritura privilegiada autorizada, verificar la protección posterior a UPDATE y DELETE por lotes, incluido el último administrador. Confirmar que INT-06B sigue impidiendo cambios incompatibles en perfiles asignados.

## Reversión

1. Pausar escrituras y volver a `VITE_BACKEND_35_6=false` sin reabrir el frontend todavía. Confirmar de nuevo el proyecto y que existen las tres definiciones originales en el esquema privado.
2. Con autorización de reversión, ejecutar completo [el rollback](../supabase/patches/035_06_backend_rollback.sql) como `postgres` en SQL Editor. Se restauran las tres RPC sustituidas con sus propietarios y ACL vigentes, se retiran los triggers nuevos y se eliminan las funciones, tablas y esquema internos de la fase.
3. Confirmar que los triggers `gw03506_*` y las dos RPC nuevas desaparecieron, que las tres RPC originales conservan sus firmas y permisos, y que siguen vigentes los triggers de INT-05 e INT-06B. Reiniciar Vite o reconstruir con la bandera apagada y verificar las operaciones del contrato anterior antes de reabrir.
4. Los cambios de negocio confirmados, el historial, la bitácora y las notificaciones generados durante el intervalo permanecen. Si también se necesita recuperar datos anteriores, usar el flujo de recuperación separado en un destino aislado.
