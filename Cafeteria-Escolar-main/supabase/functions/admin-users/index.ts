import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type AppRole = 'administrator' | 'cashier' | 'inventory'
type Permission = 'admin:access' | 'pos:access' | 'pos:charge' | 'cash-register:own' | 'cash-register:close' | 'student:read' | 'student:write' | 'student:abono' | 'inventory:read' | 'inventory:write' | 'sales:read' | 'reports:read'
const validPermissions = new Set<Permission>(['admin:access', 'pos:access', 'pos:charge', 'cash-register:own', 'cash-register:close', 'student:read', 'student:write', 'student:abono', 'inventory:read', 'inventory:write', 'sales:read', 'reports:read'])

interface UserInput {
  id?: string
  email?: string
  password?: string
  displayName?: string
  role?: AppRole
  active?: boolean
  isSuperAdmin?: boolean
  cashRegisterId?: string | null
  categoryAccessRestricted?: boolean
  allowedCategoryIds?: string[]
  permissions?: Permission[]
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function validRole(value: unknown): value is AppRole {
  return value === 'administrator' || value === 'cashier' || value === 'inventory'
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'Falta configurar Supabase para administrar usuarios.' }, 500)

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Inicia sesión como administrador.' }, 401)

  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  })
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: callerData, error: callerError } = await callerClient.auth.getUser()
  if (callerError || !callerData.user) return json({ error: 'La sesión no es válida.' }, 401)

  const { data: callerProfile, error: profileError } = await serviceClient
    .from('profiles')
    .select('role,active,is_super_admin,cafeteria_id')
    .eq('user_id', callerData.user.id)
    .maybeSingle()
  if (profileError || callerProfile?.role !== 'administrator' || !callerProfile.active) {
    return json({ error: 'Solo un administrador activo puede gestionar usuarios.' }, 403)
  }

  try {
    const body = await request.json() as { action?: string; user?: UserInput }

    if (body.action === 'list') {
      const [{ data: profiles, error: usersError }, authUsers] = await Promise.all([
        serviceClient.from('profiles')
          .select('user_id,display_name,role,cash_register_id,cafeteria_id,is_super_admin,active,category_access_restricted,allowed_category_ids,allowed_permissions,cash_registers(name)')
          .order('display_name'),
        (async () => {
          const allUsers = []
          for (let page = 1; ; page += 1) {
            const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: 1000 })
            if (error) throw error
            allUsers.push(...data.users)
            if (data.users.length < 1000) break
          }
          return allUsers
        })(),
      ])
      if (usersError) throw usersError
      const authById = new Map(authUsers.map((user) => [user.id, user]))
      const visibleProfiles = callerProfile.is_super_admin
        ? profiles ?? []
        : (profiles ?? []).filter((profile) => profile.cafeteria_id === callerProfile.cafeteria_id)
      return json(visibleProfiles.flatMap((profile) => {
        const authUser = authById.get(profile.user_id)
        if (!authUser) return []
        const register = Array.isArray(profile.cash_registers) ? profile.cash_registers[0] : profile.cash_registers
        return [{
          id: profile.user_id,
          displayName: profile.display_name,
          email: authUser.email ?? '',
          role: profile.role,
          isSuperAdmin: profile.is_super_admin,
          cafeteriaId: profile.cafeteria_id,
          active: profile.active,
          cashRegisterId: profile.cash_register_id,
          cashRegisterName: register?.name ?? null,
          categoryAccessRestricted: profile.category_access_restricted,
          allowedCategoryIds: profile.allowed_category_ids ?? [],
          permissions: profile.allowed_permissions ?? null,
          lastSignInAt: authUser.last_sign_in_at ?? null,
        }]
      }))
    }

    const input = body.user
    if (!input || !validRole(input.role)) return json({ error: 'El rol del usuario no es válido.' }, 400)
    const displayName = input.displayName?.trim() ?? ''
    if (displayName.length < 2 || displayName.length > 120) return json({ error: 'El nombre debe tener entre 2 y 120 caracteres.' }, 400)

    const allowedCategoryIds = Array.isArray(input.allowedCategoryIds)
      ? [...new Set(input.allowedCategoryIds.filter((value) => typeof value === 'string'))]
      : []
    if (allowedCategoryIds.length > 100) return json({ error: 'Selecciona menos categorías.' }, 400)
    const defaultPermissions: Permission[] = input.role === 'inventory'
      ? ['inventory:read', 'inventory:write', 'student:read']
      : ['admin:access', 'pos:access', 'pos:charge', 'cash-register:own', 'cash-register:close', 'student:read', 'student:abono', 'sales:read']
    const permissions = input.role === 'administrator' ? null : Array.isArray(input.permissions)
      ? [...new Set(input.permissions.filter((value): value is Permission => validPermissions.has(value)))]
      : defaultPermissions
    if (Array.isArray(input.permissions) && permissions.length !== new Set(input.permissions).size) {
      return json({ error: 'Uno o más permisos seleccionados no son válidos.' }, 400)
    }
    const roleAllowsPermission = (permission: Permission) => input.role === 'cashier'
      ? !permission.startsWith('inventory:')
      : input.role === 'inventory'
        ? !permission.startsWith('pos:') && permission !== 'student:abono'
        : true
    if (permissions && permissions.some((permission) => !roleAllowsPermission(permission))) {
      return json({ error: 'Ese permiso no está disponible para el rol seleccionado.' }, 400)
    }
    if (input.role === 'cashier' && permissions.includes('pos:access') && !permissions.includes('cash-register:own')) {
      return json({ error: 'Para abrir el punto de venta, asigna también permiso de uso de caja.' }, 400)
    }
    const requirements: Array<[Permission, Permission]> = [
      ['pos:charge', 'pos:access'], ['student:abono', 'student:read'],
      ['student:abono', 'pos:access'], ['student:write', 'student:read'],
      ['inventory:write', 'inventory:read'],
      ['cash-register:close', 'cash-register:own'],
      ['cash-register:close', 'admin:access'],
      ['cash-register:close', 'sales:read'],
      ['cash-register:close', 'student:read'],
    ]
    const missingRequirement = requirements.find(([permission, prerequisite]) =>
      permissions?.includes(permission) && !permissions.includes(prerequisite),
    )
    if (missingRequirement) return json({ error: `El permiso ${missingRequirement[0]} requiere también ${missingRequirement[1]}.` }, 400)
    if (permissions && !permissions.some((permission) => ['admin:access', 'pos:access', 'inventory:read'].includes(permission))) {
      return json({ error: 'Asigna al menos un acceso principal a la cuenta.' }, 400)
    }
    if (allowedCategoryIds.length > 0) {
      const { data: categories, error: categoriesError } = await serviceClient
        .from('product_categories').select('id').in('id', allowedCategoryIds).eq('active', true)
      if (categoriesError) throw categoriesError
      if ((categories?.length ?? 0) !== allowedCategoryIds.length) return json({ error: 'Una o más categorías ya no están activas.' }, 400)
    }

    let cashRegisterId = input.cashRegisterId || null
    if (!cashRegisterId) return json({ error: 'Asigna una caja activa a cada usuario.' }, 400)
    const { data: register, error: registerError } = await serviceClient.from('cash_registers')
      .select('id,cafeteria_id').eq('id', cashRegisterId).eq('active', true).maybeSingle()
    if (registerError) throw registerError
    if (!register) return json({ error: 'Selecciona una caja activa.' }, 400)
    if (!callerProfile.is_super_admin && register.cafeteria_id !== callerProfile.cafeteria_id) {
      return json({ error: 'Solo puedes asignar cajas de tu cafetería.' }, 403)
    }
    if (input.isSuperAdmin && (input.role !== 'administrator' || !callerProfile.is_super_admin)) {
      return json({ error: 'Solo un administrador superior puede otorgar ese nivel de acceso.' }, 403)
    }

    if (body.action === 'create') {
      const email = input.email?.trim().toLowerCase() ?? ''
      const password = input.password ?? ''
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Escribe un correo válido.' }, 400)
      if (password.length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, 400)

      const { data: createdAuth, error: createError } = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      })
      if (createError) return json({ error: createError.message }, 400)

      const { error: insertError } = await serviceClient.from('profiles').insert({
        user_id: createdAuth.user.id,
        display_name: displayName,
        role: input.role,
        is_super_admin: Boolean(input.isSuperAdmin && callerProfile.is_super_admin),
        cafeteria_id: register.cafeteria_id,
        active: input.active ?? true,
        cash_register_id: cashRegisterId,
        category_access_restricted: input.categoryAccessRestricted ?? false,
        allowed_category_ids: allowedCategoryIds,
        allowed_permissions: permissions,
      })
      if (insertError) {
        await serviceClient.auth.admin.deleteUser(createdAuth.user.id)
        throw insertError
      }
      return json({ id: createdAuth.user.id }, 201)
    }

    if (body.action === 'update') {
      if (!input.id) return json({ error: 'Falta el usuario que se va a editar.' }, 400)
      const { data: existingProfile, error: existingProfileError } = await serviceClient.from('profiles')
        .select('role,active,is_super_admin,cafeteria_id').eq('user_id', input.id).maybeSingle()
      if (existingProfileError) throw existingProfileError
      if (!existingProfile) return json({ error: 'No se encontró el perfil que se va a editar.' }, 404)
      if (!callerProfile.is_super_admin && existingProfile.cafeteria_id !== callerProfile.cafeteria_id) {
        return json({ error: 'No tienes acceso a usuarios de otra cafetería.' }, 403)
      }
      if (existingProfile.is_super_admin && !callerProfile.is_super_admin) {
        return json({ error: 'Solo un administrador superior puede editar esta cuenta.' }, 403)
      }
      if (input.id === callerData.user.id && (input.role !== 'administrator' || input.active === false)) {
        return json({ error: 'No puedes quitarte tus propios permisos de administrador ni desactivar tu cuenta desde aquí.' }, 400)
      }
      if (existingProfile.is_super_admin && (!input.isSuperAdmin || input.active === false)) {
        const { count, error: superAdminCountError } = await serviceClient.from('profiles')
          .select('user_id', { count: 'exact', head: true }).eq('is_super_admin', true).eq('active', true)
        if (superAdminCountError) throw superAdminCountError
        if ((count ?? 0) <= 1) return json({ error: 'Debe quedar al menos un administrador superior activo.' }, 400)
      }
      if (existingProfile.role === 'administrator' && (input.role !== 'administrator' || input.active === false)) {
        const { count, error: countError } = await serviceClient.from('profiles')
          .select('user_id', { count: 'exact', head: true }).eq('role', 'administrator').eq('active', true)
        if (countError) throw countError
        if ((count ?? 0) <= 1) return json({ error: 'Debe quedar al menos un administrador activo.' }, 400)
      }
      const authUpdate: { email?: string; password?: string; user_metadata: { display_name: string } } = {
        user_metadata: { display_name: displayName },
      }
      if (input.email?.trim()) authUpdate.email = input.email.trim().toLowerCase()
      if (input.password) {
        if (input.password.length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, 400)
        authUpdate.password = input.password
      }
      const { error: authUpdateError } = await serviceClient.auth.admin.updateUserById(input.id, authUpdate)
      if (authUpdateError) return json({ error: authUpdateError.message }, 400)

      const { data: updatedProfile, error: updateError } = await serviceClient.from('profiles').update({
        display_name: displayName,
        role: input.role,
        is_super_admin: callerProfile.is_super_admin ? Boolean(input.isSuperAdmin && input.role === 'administrator') : existingProfile.is_super_admin,
        cafeteria_id: register.cafeteria_id,
        active: input.active ?? true,
        cash_register_id: cashRegisterId,
        category_access_restricted: input.categoryAccessRestricted ?? false,
        allowed_category_ids: allowedCategoryIds,
        allowed_permissions: permissions,
      }).eq('user_id', input.id).select('user_id').maybeSingle()
      if (updateError) throw updateError
      if (!updatedProfile) return json({ error: 'No se encontró el perfil que se va a editar.' }, 404)
      return json({ id: input.id })
    }

    return json({ error: 'Acción no reconocida.' }, 400)
  } catch (error) {
    console.error('admin-users failed', error)
    return json({ error: error instanceof Error ? error.message : 'No fue posible completar la operación.' }, 500)
  }
})
