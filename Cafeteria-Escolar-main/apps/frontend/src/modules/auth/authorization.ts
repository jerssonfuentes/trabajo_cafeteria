import type { AppRole, Permission } from './types'

const rolePermissions: Record<AppRole, ReadonlySet<Permission>> = {
  administrator: new Set<Permission>(['admin:access', 'pos:access', 'pos:charge', 'cash-register:own', 'student:read', 'student:write', 'student:abono', 'inventory:read', 'inventory:write', 'sales:read', 'reports:read']),
  cashier: new Set<Permission>(['pos:access', 'pos:charge', 'cash-register:own', 'student:read', 'student:abono', 'sales:read']),
  inventory: new Set<Permission>(['inventory:read', 'inventory:write', 'student:read']),
}

export type ProtectedRoute = 'admin' | 'inventory' | 'pos'

const routePermission: Record<ProtectedRoute, Permission> = {
  admin: 'admin:access',
  inventory: 'inventory:read',
  pos: 'pos:access',
}

export function hasPermission(role: AppRole, permission: Permission, customPermissions?: Permission[] | null) {
  if (role === 'administrator') return true
  return customPermissions ? customPermissions.includes(permission) : rolePermissions[role].has(permission)
}

export function canAccessRoute(role: AppRole, route: ProtectedRoute, customPermissions?: Permission[] | null) {
  return hasPermission(role, routePermission[route], customPermissions)
}

export function defaultRouteFor(role: AppRole, customPermissions?: Permission[] | null): ProtectedRoute {
  const routes: ProtectedRoute[] = role === 'inventory'
    ? ['inventory', 'admin', 'pos']
    : role === 'cashier' ? ['pos', 'admin', 'inventory'] : ['admin', 'pos', 'inventory']
  return routes.find((route) => canAccessRoute(role, route, customPermissions)) ?? 'pos'
}
