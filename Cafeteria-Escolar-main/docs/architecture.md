# Arquitectura actual

El repositorio es un monorepo npm con React/TypeScript/Vite en `apps/frontend`, espacios reservados para `apps/backend` y `packages/shared`, y migraciones PostgreSQL/Supabase en `supabase/`.

## Capas

- **Aplicación:** `src/main.tsx` monta el contexto de autenticación; `src/app/App.tsx` resuelve las páginas usando el hash (`#/admin`, `#/inventory` y POS por defecto).
- **Módulos:** `src/modules` separa `auth`, `pos`, `students`, `sales`, `inventory` y `administration`. Los componentes de UI llaman hooks/repositorios de sus capacidades.
- **Infraestructura:** `src/infrastructure/supabase` configura el cliente público de Supabase; `src/infrastructure/sync` guarda y reintenta ventas offline usando un outbox en `localStorage`.
- **Datos y seguridad:** PostgreSQL/Supabase es el almacenamiento real conectado para autenticación, estudiantes, movimientos, ventas y existencias. RLS y funciones RPC autorizan y realizan mutaciones transaccionales. Las guardas React controlan navegación y experiencia, no sustituyen la autorización de servidor.
- **Contenedores:** Vite entrega la app web; Capacitor incluye la app frontend en Android. Vercel publica `apps/frontend/dist`.

## Límites de implementación

El backend Node.js y los contratos compartidos no están implementados. Los endpoints Vercel `api/auth/*` son stubs que responden 503; el frontend usa Supabase Auth directamente. El panel de administración está conectado a un servicio de demostración en memoria. El POS usa catálogo estático de respaldo además de consultar el inventario.

La capacidad offline se limita a lecturas cacheadas de inventario y a ventas pendientes en cola, que se reenvían cuando hay conexión. No hay almacenamiento general en IndexedDB/SQLite ni sincronización offline de todas las entidades.

## Evolución

Mantener la separación de módulos y adaptadores. Si se amplía el soporte offline, la lógica de negocio debe seguir separada del formato de almacenamiento, y las mutaciones remotas deben conservar idempotencia, validación del lado servidor y reglas de conflicto definidas. El estado planeado no debe confundirse con la implementación existente; ver [guía detallada](project-guide.md).
