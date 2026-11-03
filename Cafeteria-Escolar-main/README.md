# CAFETERÍA ESCOLAR

Aplicación modular para gestionar el POS, estudiantes y existencias de una cafetería escolar. Incluye frontend web responsive, integración Supabase y contenedor Android mediante Capacitor.

## Tecnologías

- React + TypeScript + Vite
- Tailwind CSS
- Capacitor para Android
- npm workspaces
- Supabase Auth y PostgreSQL con políticas RLS y funciones RPC
- Cola local de ventas para sincronización posterior cuando se recupera la conexión

El backend Node.js y los contratos compartidos están reservados y aún no están implementados. La persistencia actual de estudiantes, ventas e inventario usa Supabase; el panel de administración continúa usando datos de demostración.

## Estructura

```text
apps/
  frontend/       Aplicación React y contenedor Capacitor
  backend/        Backend Node.js (reservado)
packages/
  shared/         Contratos y utilidades compartidas
docs/             Documentación técnica
```

Los módulos funcionales iniciales se encuentran en `apps/frontend/src/modules`:

- `pos`: punto de venta.
- `administration`: administración.
- `inventory`: inventarios.

Consulta la [guía detallada del proyecto](docs/project-guide.md) para la arquitectura real, los flujos de módulos, las migraciones, el estado de las integraciones y sus límites actuales.

## Requisitos

- Node.js 22 o superior
- npm 10 o superior
- Para compilar Android en una fase posterior: Android Studio y un JDK compatible con Capacitor

## Desarrollo

Desde la raíz de este repositorio:

```powershell
npm install
npm run dev
```

Vite mostrará la URL local del servidor de desarrollo.

## Verificación

```powershell
npm run typecheck
npm run build
```

## Caché y dependencias

`node_modules`, la caché y los artefactos de compilación no forman parte del código fuente versionado.

Antes de ejecutar una compilación Android, mantén también la caché de Gradle en D durante esa sesión de PowerShell:

```powershell
$env:GRADLE_USER_HOME = 'D:\Proyectos\Cafeteria-Escolar\.gradle'
```

La compilación Android no se ejecuta en esta fase, por lo que todavía no se ha generado una caché de Gradle.
