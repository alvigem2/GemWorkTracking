# Respaldos de PostgreSQL de GemWork Tracking

El workflow guarda un respaldo lógico del esquema `public` en un bucket S3 privado. El nombre identifica la fecha y hora de La Paz, la ejecución y el intento. GitHub Actions conserva el resultado y el tamaño verificado. El archivo queda en el almacenamiento privado y fuera de GitHub Pages.

## Cobertura

| Incluido en el archivo | Recuperación aparte |
| --- | --- |
| Definiciones de tablas y datos de aplicación en `public`, secuencias, funciones, triggers, restricciones, índices y políticas RLS de ese esquema. | Usuarios, credenciales y sesiones de Supabase Auth en `auth`. Los perfiles de aplicación en `public` sí están incluidos. |
| Definiciones de objetos de `public` que pueden depender de otros esquemas. | Binarios, buckets, metadatos y políticas de Storage. |
| ACL y referencias a propietarios presentes en el archivo, para revisión durante la recuperación. | Roles globales, extensiones y objetos externos necesarios, secretos, configuración gestionada de Supabase, Edge Functions, publicaciones y suscripciones. |

Un respaldo de `public` puede depender de cuentas de Auth con UUID concretos y de funciones de Supabase como `auth.uid()`. Resolver esas dependencias forma parte de la recuperación. [Documentación de pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html) · [Alcance de los respaldos de Supabase](https://supabase.com/docs/guides/platform/backups)

## Activación

1. Confirma el destino S3 independiente. Activa las cuatro opciones de **Block Public Access**, revisa que solo las identidades previstas puedan acceder y evita exponer el bucket mediante CDN o sitios estáticos. El workflow verifica la cuenta propietaria y el bloqueo público antes de conectarse a PostgreSQL.
2. Crea el entorno **postgres-backup** en GitHub y restringe su uso a la rama predeterminada. Define allí los secretos. Usa una identidad AWS dedicada con `s3:GetBucketPublicAccessBlock` sobre el bucket y `s3:PutObject` y `s3:GetObject` solo sobre el prefijo `gemwork/postgres/*`. El permiso de lectura permite verificar el objeto con HEAD. La identidad de respaldo carece de permisos de borrado o de cambio de políticas.
3. En Supabase, copia los parámetros de la conexión **Direct** o **Session pooler**, por el puerto 5432. Usa el pooler de sesión si el runner solo dispone de IPv4 y el endpoint directo requiere IPv6. Descarga el certificado CA de Supabase, configura TLS con `verify-full` y usa un usuario de respaldo autorizado para leer todos los datos y objetos de `public`. El respaldo debe fallar si los permisos o RLS impiden una exportación completa. [Conexiones de Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres) · [TLS de PostgreSQL en Supabase](https://supabase.com/docs/guides/platform/ssl-enforcement)
4. Con la configuración y el almacenamiento aprobados, establece `BACKUP_ENABLED=true` como variable de repositorio. Cuando el workflow esté en la rama predeterminada, usa **Actions → Respaldo PostgreSQL → Run workflow** para un primer respaldo manual autorizado. Comprueba el resumen de la ejecución y la presencia del objeto privado verificado.
5. Después de validar el flujo manual, habilita el bloque `schedule` comentado en el YAML. El cron `0 6 * * *` corresponde a las **02:00 de Bolivia**. GitHub usa la rama predeterminada y la ejecución puede demorarse. Para detener ambas modalidades, cambia `BACKUP_ENABLED` a `false`. [Eventos programados de GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)

### Secretos del entorno

| Nombre | Contenido |
| --- | --- |
| `SUPABASE_DB_PASSWORD` | Contraseña del usuario PostgreSQL autorizado. |
| `BACKUP_AWS_ACCESS_KEY_ID` | Identificador de la credencial AWS dedicada. |
| `BACKUP_AWS_SECRET_ACCESS_KEY` | Secreto asociado a la credencial AWS. |

### Variables de configuración

| Nombre | Contenido |
| --- | --- |
| `BACKUP_ENABLED` | Variable de repositorio. Dejar sin definir o en `false` hasta autorizar la ejecución. |
| `SUPABASE_DB_HOST`, `SUPABASE_DB_NAME`, `SUPABASE_DB_USER` | Parámetros de la conexión compatible. |
| `SUPABASE_DB_CA_PEM` | Certificado CA público de Supabase en formato PEM. |
| `BACKUP_PG_MAJOR` | Versión mayor real del servidor. El workflow usa esa versión del cliente y la contrasta antes del volcado. |
| `BACKUP_AWS_REGION`, `BACKUP_S3_BUCKET`, `BACKUP_S3_OWNER` | Región, nombre del bucket y número de cuenta AWS propietaria. |

El workflow usa archivos temporales en el runner. Valida el catálogo del archivo y lee su contenido completo mediante `pg_restore` sin conectarse a una base de datos. La carga S3 exige un nombre nuevo, cifrado SSE-S3 y SHA-256. La comprobación posterior compara tamaño, hash y cifrado con los metadatos del objeto. La carga individual está limitada a 5 000 000 000 bytes. [Carga condicional y sumas de comprobación en S3](https://docs.aws.amazon.com/cli/latest/reference/s3api/put-object.html)

## Retención y costos

La política inicial propuesta conserva los últimos siete respaldos diarios verificados. Hasta aprobarla, el workflow conserva los objetos y no configura reglas de expiración. Revisa el tamaño real del archivo, los cargos de almacenamiento y solicitudes de S3, y los límites de infraestructura y transferencia aplicables a tus cuentas. El plan gratuito de Supabase no incluye respaldos automáticos diarios administrados. [Respaldos de Supabase](https://supabase.com/docs/guides/platform/backups) · [Precios de Amazon S3](https://aws.amazon.com/s3/pricing/)

## Recuperación en un entorno separado

1. Prepara una base PostgreSQL dedicada al ensayo, con versión compatible, y confirma explícitamente que el destino es el entorno de recuperación. Si usas Supabase, provisiona primero un proyecto separado con el entorno gestionado y las dependencias de Auth y Storage. Revisa extensiones, esquemas externos, roles y objetos ya presentes.
2. Descarga el archivo desde S3 con una identidad de recuperación autorizada. Obtén el SHA-256 de los metadatos del objeto con `head-object --checksum-mode ENABLED`. Compáralo con `openssl dgst -sha256 -binary respaldo.dump | openssl base64 -A` y revisa `pg_restore --list respaldo.dump`.
3. Revisa el orden del catálogo: definiciones iniciales, datos y objetos posteriores a los datos, como restricciones e índices. Prepara los UUID externos que requieran las claves foráneas, revisa conflictos con objetos ya existentes y recupera el esquema en el destino preparado. Como referencia, con la conexión **ya configurada al entorno aislado**, el comando es:

   ```bash
   pg_restore --dbname="$RECOVERY_DB" --exit-on-error --single-transaction \
     --no-owner --no-privileges respaldo.dump
   ```

4. Reaplica los propietarios y permisos autorizados del entorno de destino tras revisar los del origen. Comprueba conteos, integridad de claves foráneas, índices, restricciones, triggers, funciones `SECURITY DEFINER` y acceso bajo RLS con las cuentas de ensayo. Verifica también login y descarga de objetos cuando se hayan recuperado Auth y Storage por procedimientos separados.
5. Registra la fecha del respaldo, el resultado y cuánto tardó la recuperación. Aprobar una restauración parcial requiere distinguir qué datos o servicios siguen pendientes.

El panel Administrador no consume resultados de esta infraestructura. El estado del respaldo se consulta en GitHub Actions y la verificación del archivo en S3.
