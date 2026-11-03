import { requireSupabase } from '../../../infrastructure/supabase/client'
import type { Permission } from '../../auth/types'

export type ManagedRole = 'administrator' | 'cashier' | 'inventory'

export interface ManagedUser {
  id: string
  displayName: string
  email: string
  role: ManagedRole
  active: boolean
  cashRegisterId: string | null
  cashRegisterName: string | null
  categoryAccessRestricted: boolean
  allowedCategoryIds: string[]
  permissions: Permission[] | null
  lastSignInAt: string | null
}

export interface ManagedUserDraft {
  id?: string
  displayName: string
  email: string
  password?: string
  role: ManagedRole
  active: boolean
  cashRegisterId: string | null
  categoryAccessRestricted: boolean
  allowedCategoryIds: string[]
  permissions: Permission[]
}

export interface ManagedCashRegister {
  id: string
  name: string
  active: boolean
  assignedUsers: Array<{ id: string; name: string; role: ManagedRole }>
}

async function functionError(error: { message: string; context?: unknown }) {
  const context = error.context
  if (context instanceof Response) {
    try {
      const body = await context.clone().json() as { error?: string }
      if (body.error) return new Error(body.error)
    } catch {
      // Conserva el mensaje del cliente cuando la respuesta no trae JSON.
    }
  }
  return new Error(error.message || 'No fue posible completar la operación.')
}

export async function listManagedUsers() {
  const { data, error } = await requireSupabase().functions.invoke<ManagedUser[]>('admin-users', {
    body: { action: 'list' },
  })
  if (error) throw await functionError(error)
  return data ?? []
}

export async function saveManagedUser(draft: ManagedUserDraft) {
  const action = draft.id ? 'update' : 'create'
  const { data, error } = await requireSupabase().functions.invoke('admin-users', {
    body: { action, user: draft },
  })
  if (error) throw await functionError(error)
  return data
}

export async function listManagedCashRegisters() {
  const { data, error } = await requireSupabase().from('cash_registers')
    .select('id,name,active,profiles(user_id,display_name,role,active)')
    .order('name')
  if (error) throw new Error(error.message || 'No fue posible consultar las cajas.')
  return (data as unknown as Array<{
    id: string
    name: string
    active: boolean
    profiles: Array<{ user_id: string; display_name: string; role: ManagedRole; active: boolean }>
  }>).map((register): ManagedCashRegister => ({
    id: register.id,
    name: register.name,
    active: register.active,
    assignedUsers: register.profiles.filter((user) => user.active).map((user) => ({
      id: user.user_id,
      name: user.display_name,
      role: user.role,
    })),
  }))
}

export async function saveManagedCashRegister(input: {
  id?: string
  name: string
  active: boolean
  userId: string | null
}) {
  const { data, error } = await requireSupabase().rpc('admin_save_cash_register', {
    p_id: input.id ?? null,
    p_name: input.name.trim(),
    p_active: input.active,
    p_user_id: input.userId,
  })
  if (error?.code === '23505') throw new Error('Ya existe una caja con ese nombre.')
  if (error) throw new Error(error.message || 'No fue posible guardar la caja.')
  return data
}
