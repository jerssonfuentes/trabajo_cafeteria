# Configurar Supabase para CAFETERÍA ESCOLAR

Esta guía conecta un proyecto Supabase nuevo con el frontend y aplica el esquema versionado en `supabase/migrations/`.

## 1. Crear el proyecto

En el Dashboard de Supabase, crea un proyecto nuevo y guarda la contraseña de PostgreSQL en un gestor seguro. Esa contraseña se utilizará al vincular el CLI; no es una clave para el frontend.

No publiques datos reales de estudiantes hasta haber confirmado región, acceso y políticas con los responsables de la institución.

## 2. Obtener URL y clave pública

En Supabase abre **Connect** o **Project Settings → API Keys** y copia:

- Project URL, similar a `https://<project-ref>.supabase.co`.
- Publishable key, con formato `sb_publishable_...`.

El frontend usa exclusivamente esos dos valores. Nunca uses una `sb_secret_...`, `service_role`, contraseña de base de datos ni token personal en una variable `VITE_*`: las variables Vite se compilan en el código que recibe el navegador.

## 3. Configurar desarrollo local

Crea el archivo `apps/frontend/.env.local` con estos valores:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<tu-clave>
```

Reemplaza los dos marcadores por los valores de tu proyecto. `.env.local` está excluido de Git. No compartas su contenido.

Desde la carpeta raíz del repositorio ejecuta:

```powershell
npm run dev
```

Abre la URL que indique Vite. Antes de aplicar el esquema, la app no podrá validar perfiles ni autenticar usuarios.

## 4. Aplicar las migraciones de la base

El repositorio ya contiene `supabase/config.toml` y las migraciones. La vía recomendada es usar Supabase CLI para que se registre correctamente el historial de migraciones. Desde la raíz del repositorio, ejecuta:

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --dry-run --remote
```

El inicio de sesión del CLI requiere un Personal Access Token de Supabase; introdúcelo solo en el prompt del CLI. `link` solicita la contraseña de la base del proyecto. Revisa que el `dry-run` muestre únicamente las migraciones esperadas y luego aplícalas:

```powershell
npx supabase db push --remote
```

Las migraciones se aplican en orden por fecha:

1. `20261012183720_secure_auth_rls.sql`
2. `20261013012343_inventory_module.sql`
3. `20261013015438_simplify_cash_payment.sql`
4. `20261013060000_idempotent_student_reversal.sql`

Estas migraciones crean tablas, permisos RLS, políticas y funciones RPC que usa la app. No uses `db reset --remote`: ese comando destruye y reconstruye la base remota. Evita aplicar los SQL manualmente desde Dashboard y luego intentar `db push`, porque el editor SQL no actualiza por sí mismo el historial que usa el CLI.

## 5. Crear el usuario administrador

La app no registra usuarios nuevos. En Supabase abre **Authentication → Users** y crea/invita una cuenta administradora. Asegúrate de que el usuario exista antes de insertar el perfil.

Luego abre **SQL Editor**, sustituye los dos marcadores y ejecuta esta consulta como operador del proyecto:

```sql
insert into public.profiles (user_id, display_name, role)
select id, '<nombre que verá la app>', 'administrator'
from auth.users
where email = '<correo exacto de la cuenta>';
```

La consulta debe insertar una fila. Si no inserta ninguna, comprueba el correo en **Authentication → Users**. Las operaciones financieras no deben ejecutarse con una cuenta que no tenga un perfil activo.

Las migraciones crean la caja principal y las categorías/productos no tienen catálogo de inicio. Después del primer acceso, agrega categorías, productos y existencias en la sección de inventario antes de registrar ventas reales. Las cuentas de cajero requieren una caja activa asignada y perfil `cashier`; para personal de inventario usa el rol `inventory`.

## 6. Probar el acceso

Inicia sesión en la aplicación con el usuario creado. Comprueba al menos:

- El rol administrador abre `#/admin`, POS e inventario.
- Un perfil sin usuario autenticado no puede consultar tablas.
- Un usuario sin perfil activo no entra a la aplicación.
- Los roles `cashier` e `inventory` solo ven sus áreas permitidas.
- Se puede crear una categoría, un producto y una existencia inicial de prueba.
- En un entorno de prueba se pueden registrar una venta en efectivo y una venta a cuenta; inspecciona saldo, líneas de venta e historial de stock.

No pruebes anulaciones o movimientos financieros contra cuentas con datos reales. Los movimientos de estudiantes son auditables y los reversos crean registros compensatorios.

## 7. Configurar Vercel

En el proyecto de Vercel, configura estas variables de entorno para los entornos que vas a publicar:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Usa los mismos valores públicos del paso 2 y vuelve a desplegar. En **Authentication → URL Configuration**, configura el dominio del sitio publicado como **Site URL** y agrega las URL locales/de producción necesarias a **Redirect URLs**. Esto se necesita para callbacks y enlaces de correo de autenticación; utiliza únicamente los dominios de la aplicación.

## 8. Seguridad

- El frontend debe usar la publishable key. RLS es obligatoria y debe permanecer activa.
- No añadas secret keys, `service_role`, contraseñas, tokens personales ni credenciales SQL al repositorio, Vercel frontend o variables `VITE_*`.
- La publishable key no es un secreto: RLS, permisos SQL y funciones RPC limitan lo que pueden hacer los usuarios autenticados.
- Los perfiles y roles deben asignarse desde un canal administrativo confiable, nunca confiar en un rol enviado por el navegador.
- Revisa los asesores de seguridad del Dashboard y verifica los permisos con cada rol antes de usar datos reales.

## Referencias oficiales

- [Claves API de Supabase](https://supabase.com/docs/guides/getting-started/api-keys)
- [Desplegar migraciones de base de datos](https://supabase.com/docs/guides/deployment/database-migrations)
- [Configurar URL y redirecciones de Auth](https://supabase.com/docs/guides/auth/redirect-urls)
