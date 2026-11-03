import { isSupabaseConfigured, requireSupabase, setRememberSessionPreference } from '../../infrastructure/supabase/client'
import { normalizeAuthEmail, signInErrorMessage } from './authErrors'
import type { AppRole, AuthSession, SessionResult } from './types'

const validRoles = new Set<AppRole>(['administrator', 'cashier', 'inventory'])
const activeUserStorageKey = 'cafeteria:active-user-id'

export async function getSession(): Promise<SessionResult> {
  if (!isSupabaseConfigured) return { authenticated: false, configured: false }
  const client = requireSupabase()
  const { data: userData, error: userError } = await client.auth.getUser()
  if (userError || !userData.user) {
    window.localStorage.removeItem(activeUserStorageKey)
    return { authenticated: false, configured: true }
  }

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('display_name,role,cash_register_id,active,category_access_restricted,allowed_category_ids,allowed_permissions,cafeteria_id,is_super_admin,cash_registers(name)')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (profileError) throw new Error('No fue posible consultar el perfil autorizado.')
  if (!profile || !profile.active || !validRoles.has(profile.role as AppRole)) {
    window.localStorage.removeItem(activeUserStorageKey)
    await client.auth.signOut()
    throw new Error('La cuenta no tiene un rol activo asignado.')
  }

  const { data: sessionData } = await client.auth.getSession()
  const cashRegister = Array.isArray(profile.cash_registers)
    ? profile.cash_registers[0]
    : profile.cash_registers
  const session: AuthSession = {
    authenticated: true,
    user: {
      id: userData.user.id,
      email: userData.user.email ?? '',
      displayName: profile.display_name,
      role: profile.role as AppRole,
      isSuperAdmin: profile.is_super_admin ?? false,
      cafeteriaId: profile.cafeteria_id,
      cashRegisterId: profile.cash_register_id ?? undefined,
      cashRegisterName: cashRegister?.name ?? undefined,
      categoryAccessRestricted: profile.category_access_restricted ?? false,
      allowedCategoryIds: profile.allowed_category_ids ?? [],
      permissions: profile.allowed_permissions ?? null,
    },
    expiresAt: sessionData.session?.expires_at
      ? new Date(sessionData.session.expires_at * 1000).toISOString()
      : undefined,
  }
  window.localStorage.setItem(activeUserStorageKey, userData.user.id)
  return session
}

export async function signIn(email: string, password: string, rememberSession: boolean) {
  setRememberSessionPreference(rememberSession)
  const { error } = await requireSupabase().auth.signInWithPassword({
    email: normalizeAuthEmail(email),
    password,
  })
  if (error) throw new Error(signInErrorMessage(error.code))
}

export async function signOut() {
  const { error } = await requireSupabase().auth.signOut()
  if (error) throw new Error('No fue posible cerrar la sesión.')
  window.localStorage.removeItem(activeUserStorageKey)
}
