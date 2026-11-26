# GemWork Tracking

Aplicación web de seguimiento de proyectos para una sola empresa, desarrollada por GemWork como proyecto universitario.

- Stack: React 19 + TypeScript + Vite 8
- Backend: Supabase (PostgreSQL, Auth, RLS, Edge Functions, Storage) — **no se modifica desde este frontend**
- Autenticación: nombre de usuario + contraseña vía Edge Functions (`gemwork-login-ts`, `gemwork-admin-usuarios`)

> El backend consolidado está instalado y el frontend usa el contrato 35.6. Las pruebas autenticadas se realizan con las cuentas existentes.

## Requisitos

- Node.js >= 20 (probado con v24)
- npm >= 10 (probado con v11)

No se requieren herramientas globales.

## Instalación

```bash
npm install
```

## Configuración

1. Copia `.env.example` a `.env.local`:

   ```bash
   copy .env.example .env.local
   ```

2. Completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los valores del proyecto Supabase (solo URL y anon key; **nunca** `service_role`).

3. Configura `VITE_BACKEND_35_6=true` para el backend instalado. Reinicia el servidor de desarrollo tras cambiar `.env.local`.

> `.env` y `.env.local` están ignorados por Git. No commitees credenciales.

## Ejecución

```bash
# Servidor de desarrollo
npm run dev

# Compilar para producción
npm run build

# Previsualizar la compilación
npm run preview

# Lint
npm run lint
```

## Estructura del proyecto

```
src/
├── app/                  # raíz de la app (providers, punto de entrada de UI)
├── assets/               # imágenes, fuentes, iconos locales
├── components/
│   ├── common/           # componentes reutilizables (botones, inputs, cards)
│   └── layout/           # componentes de layout (header, sidebar, footer)
├── config/               # configuración estática de la app
├── contexts/             # contextos de React (auth, sesión, etc.)
├── features/             # funcionalidades por dominio
│   ├── auth/             # inicio de sesión, creación de cuentas admin
│   ├── dashboard/        # panel principal
│   ├── projects/         # proyectos
│   ├── tasks/            # tareas
│   ├── users/            # usuarios
│   ├── clients/          # clientes
│   ├── documents/        # documentos
│   └── notifications/    # notificaciones
├── hooks/                # hooks personalizados
├── layouts/              # layouts de página
├── lib/                  # clientes e integraciones (ej. supabase.ts)
├── pages/                # páginas/enrutamiento
├── routes/               # definición de rutas
├── services/             # llamadas a API / Edge Functions
├── styles/               # estilos globales y tokens
├── types/                # tipos TypeScript compartidos
└── utils/                # utilidades
```

## Roles

- Administrador
- Desarrollador
- Cliente

## Notas

- No hay registro público de usuarios.
- Las cuentas administrativas se crean con la Edge Function `gemwork-admin-usuarios`.
- El login se realiza con la Edge Function `gemwork-login-ts` (usuario + contraseña).
- No usar `service_role` en React.
- No se crean datos ficticios ni se modifica Supabase desde este repositorio.

## Comprobación en el navegador

- Administrador: abrir Dashboard, Clientes y Usuarios. En un proyecto existente, comprobar etapas, tareas, asignaciones, cronograma, Gantt, avance, documentos y el historial. Abrir la bandeja y filtrar la bitácora.
- Desarrollador: abrir su dashboard y una tarea asignada de un proyecto En curso. Verificar que aparezcan solo las transiciones válidas, revisar el avance y abrir los documentos autorizados. Abrir un aviso de cronograma desde la bandeja.
- Cliente: abrir su dashboard, un proyecto asignado, su avance y cronograma, y un documento publicado con alcance Cliente. Revisar la bandeja y comprobar que el panel no ofrece controles de edición.

La compilación de producción utiliza rutas con hash. En `npm run preview`, recargar una vista interna y comprobar que se mantiene la ruta. Las escrituras funcionales se pueden verificar con operaciones reales autorizadas.

## GitHub Pages

El workflow [Publicar en GitHub Pages](.github/workflows/pages.yml) se ejecuta manualmente. Al publicar, la fuente de Pages debe ser GitHub Actions y el workflow necesita las variables públicas `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Usa `VITE_BACKEND_35_6=true` para el backend instalado. El build genera recursos relativos y mantiene las rutas internas dentro del hash para servir `dist` desde la raíz o el subdirectorio del repositorio.

## Límites de bitácora

El catálogo contiene Inicio de sesión y Cierre de sesión, pero el contrato instalado no expone un productor de esos eventos. El alta por Edge Function genera un evento de creación que puede tener actor NULL. La aplicación confirma la subida de cada PDF con la respuesta de Storage, mientras que la bitácora registra los metadatos. Atribuir el alta al administrador, auditar el ciclo de sesión o registrar la confirmación de carga como evento duradero requiere cambios del lado del servidor. Véase [Consolidación del backend](docs/backend-consolidation.md).
