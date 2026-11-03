# Guía detallada del proyecto

## 1. Propósito y estado

CAFETERÍA ESCOLAR es una aplicación web para gestionar el punto de venta (POS), cuentas de estudiantes, ventas y existencias de una cafetería escolar. El frontend está hecho con React y TypeScript, compilado con Vite, y puede empaquetarse como aplicación Android con Capacitor. El repositorio es un monorepo npm.

El estado del código no es uniforme entre módulos:

| Área | Estado observado en el código |
| --- | --- |
| POS | Interfaz conectada a catálogo de inventario y operaciones de venta contra Supabase; los datos de catálogo de respaldo están definidos en código. |
| Estudiantes y movimientos | Consultas y escrituras reales mediante Supabase; movimientos financieros y reversos usan funciones SQL. |
| Inventario | Lectura/escritura contra Supabase, historial y caché local de lectura; las ventas reducen stock en el servidor. |
| Autenticación | Supabase Auth, perfil y roles; las páginas quedan bloqueadas si Supabase no está configurado o la cuenta no tiene perfil activo. |
| Administración | Panel visual con secciones, pero su `AdministrationService` devuelve fixtures demo. No es una interfaz administrativa respaldada completamente por datos reales. |
| Sincronización offline | Outbox local para ventas en efectivo y a cuenta de estudiante; reintento periódico cuando vuelve la conexión. |
| Backend Node | Reservado, sin servidor implementado. Las rutas Vercel bajo `api/auth` responden 503 y no constituyen un proveedor de identidad. |
| Shared | Reservado; aún no contiene contratos compartidos implementados. |

El `AGENTS.md` del repositorio establece que el POS aprobado debe permanecer aislado, inventarios no debe modificarse sin aprobación explícita y que no se deben introducir persistencia nueva, autenticación real, sincronización, operaciones financieras ni servidor. El código ya contiene integraciones reales de Supabase; cualquier cambio futuro debe respetar esa instrucción y el alcance que se autorice.

## 2. Estructura del repositorio

```text
apps/
  frontend/                  Aplicación React/TypeScript y proyecto Android Capacitor
    src/app/                 Selección de página por hash
    src/modules/             Funcionalidad de negocio organizada por módulo
    src/infrastructure/      Cliente Supabase y sincronización/outbox
    src/core/                 Reservado para servicios transversales
    src/shared/               Reservado para UI/utilidades compartidas
  backend/                   Placeholder; README y package.json, no servidor
packages/
  shared/                    Placeholder de contratos compartidos
api/auth/                    Handlers Vercel temporales que responden 503
supabase/
  migrations/                Esquema, RLS y funciones transaccionales SQL
  tests/                     Prueba SQL de operaciones de inventario
docs/                        Arquitectura, autenticación, Supabase y esta guía
referencias/                 Referencia visual aprobada
```

Los recursos de Android en `apps/frontend/android` incluyen el proyecto Gradle, manifiesto, actividad Capacitor y recursos gráficos. No contienen la lógica funcional, que permanece en el frontend web.

## 3. Tecnologías y comandos

- React 19, TypeScript 7, Vite 8 y Tailwind CSS 4.
- Supabase JS para Auth, Data API y llamadas RPC a PostgreSQL.
- Capacitor 8 para el contenedor Android.
- npm workspaces para `apps/*` y `packages/*`.
- `lucide-react` para iconografía.

Desde la raíz del repositorio:

```powershell
npm install
npm run dev
npm run typecheck
npm run build
npm test
```

`npm run build` ejecuta el chequeo TypeScript del workspace y luego genera la salida de Vite. `npm test` ejecuta las pruebas Node listadas explícitamente en el `package.json` raíz (reglas financieras y de estudiantes, autorización y errores de Auth, pago en efectivo y estado del outbox). Los scripts `android:sync` y `android:open` viven en el workspace frontend; el primero compila y sincroniza Capacitor con Android.

La configuración de Vite usa host `0.0.0.0` y puerto 5173. Vercel compila mediante `npm run build` y publica `apps/frontend/dist` según `vercel.json`.

## 4. Inicio de la aplicación y navegación

1. `src/main.tsx` busca el elemento HTML `#root`, monta React en `StrictMode` y envuelve la aplicación con `AuthProvider`.
2. `src/app/App.tsx` interpreta el hash: `#/admin` abre administración, `#/inventory` abre la pantalla de acceso/inventario y cualquier otro hash abre POS.
3. El listener `hashchange` mantiene el estado de ruta cuando se usan enlaces internos.
4. `AuthGate` espera la sesión y valida el permiso de la ruta antes de representar el contenido. Sin credenciales de configuración, con error de sesión o sin iniciar sesión presenta una pantalla de bloqueo/login.
5. Los roles y permisos visuales están declarados en `modules/auth/authorization.ts`: `administrator` accede a administración, POS e inventario; `cashier` a POS; `inventory` al inventario. La autorización definitiva de datos está en RLS y funciones SQL, no solo en React.

La ruta raíz/por defecto es POS, incluso cuando el hash está vacío. Tras una ruta no autorizada, el gate ofrece la ruta predeterminada del rol.

## 5. Módulos funcionales

### POS (`modules/pos`)

`PosPage.tsx` coordina el flujo y mantiene el estado de venta: catálogo, categoría/subcategoría y búsqueda, modo venta libre o estudiante, selección de estudiante, carrito, cantidades, totales, pago y diálogos. Los componentes de `components/` separan la barra superior, pestañas, catálogo, panel de cliente, carrito, estado y diálogos.

`data.ts` contiene un catálogo de respaldo y categorías visuales de demostración. La página también consulta productos activos mediante `useInventory` y adapta iconografía visual según producto/categoría. La selección de estudiante y el desglose de saldo/deuda proceden de `useStudents` y reglas compartidas del módulo de estudiantes.

Al confirmar, la página construye líneas con identificador de producto, nombre, precio unitario y cantidad. Venta libre llama `registerCashSale`; venta a cuenta llama `registerStudentSale` con estudiante. Los intentos usan claves de idempotencia y firmas de pago para evitar duplicar la misma confirmación durante reintentos. La interfaz muestra el resultado o informa que quedó en cola si no había conectividad. Las reglas de efectivo y las funciones de cálculo están separadas en `cashPayment.ts` y `format.ts`.

### Estudiantes (`modules/students`)

`types.ts` define estudiantes, borradores y movimientos (`consumption`, `top-up`, `debt-payment`, `reversal`). `studentRules.ts` normaliza códigos y búsquedas ignorando diferencias de acentos; valida campos requeridos. `financialRules.ts` trata cantidades como enteros seguros, convierte consumos a montos negativos y presenta el balance neto como saldo positivo/deuda positiva.

`studentRepository.ts` mapea las columnas snake_case de PostgreSQL a tipos TypeScript. Lee estudiantes y movimientos, guarda/cambia estado de estudiantes y ejecuta `record_student_movement` o `reverse_student_movement`. El ID del dispositivo se guarda en `localStorage`; las claves de idempotencia se generan con UUID. El evento `cafeteria:students-changed` permite a los hooks refrescar lecturas. `useStudents.ts` hace la carga inicial y escucha ese evento.

### Inventario (`modules/inventory`)

`inventoryRepository.ts` lista categorías, productos y movimientos desde Supabase; mapea los registros a tipos de UI y cachea las lecturas en `localStorage`. Si falla una lectura usa la última caché disponible. Al listar productos descuenta visualmente del stock las unidades incluidas en ventas pendientes del outbox. Las escrituras llaman a las funciones SQL `save_inventory_category`, `save_inventory_product` y `record_stock_movement`. Cada mutación emite `cafeteria:inventory-changed`.

`useInventory.ts` administra carga/refresco y suscripción al evento. `InventoryAccessPage.tsx` encuadra la pantalla protegida y `InventorySection.tsx` implementa vistas de productos, alertas de stock, historial y categorías, con formularios de edición/creación y registro de entradas/ajustes. La UI habilita controles de escritura según permisos, mientras RLS/RPC aplica seguridad en servidor.

### Administración (`modules/administration`)

`AdministrationPage.tsx` y `AdminShell.tsx` presentan un panel con dashboard, estudiantes, saldos, inventario, usuarios, cajas, ventas, reportes y configuración. Cada sección vive en `sections/`; componentes y formateadores comunes viven en `components/` y `format.ts`.

La interfaz está alimentada por `demoAdministrationService` y fixtures estáticos de `data.ts`: estudiantes, movimientos, usuarios, cajas, ventas y cifras de gráficos. No debe confundirse con repositorios conectados. Aunque algunas acciones visuales estén presentes, esta capa no implementa por sí sola gestión persistente de usuarios/cajas/reportes; el módulo real de inventario tiene su propio repositorio y Supabase. La página está protegida por el rol administrador, pero eso no transforma los fixtures en datos reales.

### Ventas (`modules/sales`)

`saleRepository.ts` llama las RPC `record_student_sale` y `record_cash_sale`, prepara operaciones idempotentes, encola ventas cuando el navegador está offline o si el error parece de conectividad, y publica eventos para refrescar estudiantes/inventario/ventas. También expone `voidSale`, listado de hasta 200 ventas y resúmenes por caja. La base de datos calcula/prevalida el total, registra líneas e inventario en una transacción SQL.

## 6. Infraestructura, offline y sincronización

`infrastructure/supabase/client.ts` crea un cliente solo si están definidas `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. La clave debe ser publishable/anon pública, nunca service role o secreto. Sin configuración, las rutas protegidas permanecen cerradas.

La autenticación está en `modules/auth`: `authClient.ts` valida el usuario actual con Supabase Auth, consulta su perfil activo y rol en `profiles`, normaliza email y permite login/logout; `AuthProvider` conserva estado en contexto y revalida cambios; `LoginForm` y `AuthGate` son UI; `authorization.ts` contiene la matriz visual de permisos. `api/auth/session.js`, `login.js` y `logout.js` son placeholders Vercel con HTTP 503 y no se usan como implementación de sesión.

El outbox (`infrastructure/sync/outboxState.ts`) serializa ventas pendientes en `localStorage` bajo `cafeteria:sync-outbox:v1`, evita duplicados por clave idempotente y conserva intentos/error. `outbox.ts` reenvía secuencialmente las operaciones a las RPC correspondientes; `useSyncStatus.ts` intenta al iniciar, cuando vuelve online y cada 30 segundos mientras haya operaciones. El estado de sincronización usa eventos y guarda la última hora de sincronización.

Este mecanismo cubre la cola de ventas, no constituye una arquitectura offline completa. No hay IndexedDB ni SQLite implementados como almacén general, ni cola offline de cambios de estudiantes/inventario. La caché de inventario solo resuelve lecturas fallidas. Auth y una escritura de venta requieren conectividad para validación/registro y una cola pendiente no es todavía una confirmación del servidor.

## 7. Modelo de datos y migraciones Supabase

Las migraciones se aplican en orden cronológico:

1. `20261012183720_secure_auth_rls.sql`: roles (`administrator`, `cashier`, `inventory`), estado de estudiante, tipo de movimiento, método de pago; tablas de perfiles, cajas, estudiantes/movimientos, ventas/líneas, productos y movimientos de stock; triggers de `updated_at`, funciones de rol/caja, RLS, grants y operaciones iniciales de movimientos de estudiante, reverso, venta de estudiante y ajuste de stock.
2. `20261013012343_inventory_module.sql`: categorías y campos extendidos de producto, SKU/índices, controles RLS y RPC para guardar productos/categorías, entradas/ajustes, aplicar stock de ventas, venta en efectivo y anulación de ventas. Ventas y su movimiento de stock se coordinan en el servidor.
3. `20261013015438_simplify_cash_payment.sql`: reemplaza la RPC de venta en efectivo para seleccionar/validar una caja, verificar total contra precios vigentes y registrar existencias y líneas.
4. `20261013060000_idempotent_student_reversal.sql`: hace que el reverso sea idempotente, bloquea el movimiento original durante la operación y devuelve el reverso ya creado si se repite la petición.

Las funciones privilegiadas usan `SECURITY DEFINER` y `search_path` controlado. Las tablas habilitan RLS, restringen operaciones por rol/usuario/caja, revocan acceso anónimo y otorgan operaciones específicas. La base valida operaciones financieras e inventario; no se debe sustituir esa validación por checks exclusivamente visuales.

`supabase/tests/inventory_transaction.sql` contiene una prueba SQL para transacciones de inventario. `supabase/config.toml` es configuración local de Supabase, incluyendo Auth, API y entorno de base de datos; su contenido no prueba que el proyecto remoto tenga migraciones aplicadas.

## 8. Configuración y despliegue

Configurar en entorno local/deploy:

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Crear usuarios en Supabase Auth y asignarles un perfil activo en `public.profiles` por un canal administrativo de confianza. Las políticas bloquean usuarios que no tengan perfil válido. Cajeros necesitan una caja activa asignada; la migración de caja define el comportamiento aplicable a administradores.

El despliegue Vercel sirve el frontend estático. Las funciones en `api/auth` continúan devolviendo 503 y las páginas no las consumen. La configuración real de identidad es Supabase Auth, no las rutas placeholder.

## 9. Límites y puntos a tener en cuenta

- La documentación antigua (`architecture.md`, parte de `README.md`) todavía presenta Supabase/persistencia como fase futura. Esta guía describe el código actual, que ya incluye consultas/RPC, RLS y cola de ventas.
- El panel administrativo muestra datos de demostración, aunque la pantalla visual presente varias áreas funcionales.
- Los handlers Vercel de sesión/login/logout son stubs 503; la app usa directamente Supabase Auth.
- El offline implementado cubre ventas en cola y caché de lectura de inventario, no todas las operaciones ni una base local general.
- Los datos de demostración en POS y administración deben distinguirse de los datos persistidos.
- La existencia de SQL de migraciones/configuración no demuestra que el entorno Supabase de producción esté actualizado o que las políticas hayan sido verificadas allí.
- `apps/backend` y `packages/shared` son placeholders; la lógica servidor actual vive en funciones PostgreSQL Supabase.

## 10. Mapa rápido de archivos

| Archivo o directorio | Responsabilidad |
| --- | --- |
| `apps/frontend/src/main.tsx` | Montaje React y contexto de Auth |
| `apps/frontend/src/app/App.tsx` | Enrutamiento por hash y páginas |
| `apps/frontend/src/modules/auth/` | Sesión Supabase, roles, gate y formulario login |
| `apps/frontend/src/modules/pos/` | Flujo de venta y componentes POS |
| `apps/frontend/src/modules/students/` | Tipos, reglas, acceso Supabase a estudiantes/movimientos |
| `apps/frontend/src/modules/sales/saleRepository.ts` | RPCs de ventas, cola offline, consultas y anulación |
| `apps/frontend/src/modules/inventory/` | Catálogo, movimientos, caché y pantallas de stock |
| `apps/frontend/src/modules/administration/` | Panel administrativo y fixtures demo |
| `apps/frontend/src/infrastructure/sync/` | Persistencia/reintento de ventas pendientes |
| `apps/frontend/src/infrastructure/supabase/client.ts` | Cliente Supabase configurado por entorno |
| `supabase/migrations/` | Modelo SQL, seguridad y operaciones atómicas |
| `apps/frontend/android/` | Contenedor Android de Capacitor |
| `api/auth/` | Endpoints placeholder que responden 503 |

