export type AppRole = 'administrator' | 'cashier' | 'inventory'

export type Permission =
  | 'admin:access'
  | 'pos:access'
  | 'pos:charge'
  | 'cash-register:own'
  | 'student:read'
  | 'student:write'
  | 'student:abono'
  | 'inventory:read'
  | 'inventory:write'
  | 'sales:read'
  | 'reports:read'

export const APP_PERMISSIONS: ReadonlyArray<{ id: Permission; label: string; description: string; group: string }> = [
  { id: 'admin:access', label: 'Panel de gestión', description: 'Entrar a las secciones de administración que también estén autorizadas abajo.', group: 'Acceso' },
  { id: 'pos:access', label: 'Punto de venta', description: 'Abrir la caja y consultar productos.', group: 'Caja' },
  { id: 'pos:charge', label: 'Registrar ventas y consumos', description: 'Cobrar ventas y cargar consumos a estudiantes.', group: 'Caja' },
  { id: 'cash-register:own', label: 'Usar caja asignada', description: 'Operar con la caja vinculada al usuario.', group: 'Caja' },
  { id: 'student:read', label: 'Consultar estudiantes y saldos', description: 'Buscar estudiantes y revisar su cuenta.', group: 'Estudiantes' },
  { id: 'student:abono', label: 'Registrar abonos y recargas', description: 'Recibir pagos y sumarlos a la cuenta del estudiante.', group: 'Estudiantes' },
  { id: 'student:write', label: 'Administrar estudiantes', description: 'Crear, editar y activar estudiantes.', group: 'Estudiantes' },
  { id: 'inventory:read', label: 'Consultar inventario', description: 'Ver productos, categorías y existencias.', group: 'Inventario' },
  { id: 'inventory:write', label: 'Editar inventario', description: 'Crear y editar productos, categorías y existencias.', group: 'Inventario' },
  { id: 'sales:read', label: 'Consultar ventas', description: 'Ver ventas y movimientos permitidos para su caja.', group: 'Información' },
  { id: 'reports:read', label: 'Consultar reportes', description: 'Ver informes e indicadores disponibles.', group: 'Información' },
]

export interface AuthenticatedUser {
  id: string
  displayName: string
  email: string
  role: AppRole
  cashRegisterId?: string
  cashRegisterName?: string
  categoryAccessRestricted: boolean
  allowedCategoryIds: string[]
  permissions: Permission[] | null
}

export interface AuthSession {
  authenticated: true
  user: AuthenticatedUser
  expiresAt?: string
}

export type SessionResult =
  | AuthSession
  | { authenticated: false; configured: boolean }
