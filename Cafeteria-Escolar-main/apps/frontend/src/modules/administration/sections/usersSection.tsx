import { useCallback, useEffect, useMemo, useState } from 'react'
import { KeyRound, Pencil, Plus, Power, ShieldCheck } from 'lucide-react'

import { useInventory } from '../../inventory'
import {
  listManagedCashRegisters,
  listManagedUsers,
  saveManagedUser,
  type ManagedCashRegister,
  type ManagedRole,
  type ManagedUser,
  type ManagedUserDraft,
} from '../services/adminManagementService'
import { AdminDialog, PageHeader, SearchField, StatusPill } from '../components/AdminUi'
import { APP_PERMISSIONS, type Permission } from '../../auth/types'
import { useAuth } from '../../auth'

interface UserEditor extends ManagedUserDraft {
  password: string
}

const roleLabels: Record<ManagedRole, string> = {
  administrator: 'Administrador',
  cashier: 'Cajero',
  inventory: 'Inventarios',
}

const roleValues = Object.entries(roleLabels) as Array<[ManagedRole, string]>

function emptyEditor(): UserEditor {
  return {
    displayName: '',
    email: '',
    password: '',
    role: 'cashier',
    isSuperAdmin: false,
    active: true,
    cashRegisterId: null,
    categoryAccessRestricted: false,
    allowedCategoryIds: [],
    permissions: ['admin:access', 'pos:access', 'pos:charge', 'cash-register:own', 'cash-register:close', 'student:read', 'student:abono', 'sales:read'],
  }
}

function formatLastAccess(value: string | null) {
  if (!value) return 'Sin acceso'
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function UsersSection() {
  const { session } = useAuth()
  const isSuperAdmin = session?.user.isSuperAdmin ?? false
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [registers, setRegisters] = useState<ManagedCashRegister[]>([])
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('Todos')
  const [editor, setEditor] = useState<UserEditor | null>(null)
  const [confirmation, setConfirmation] = useState<ManagedUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { categories } = useInventory(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [nextUsers, nextRegisters] = await Promise.all([listManagedUsers(), listManagedCashRegisters()])
      setUsers(nextUsers)
      setRegisters(nextRegisters)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar los usuarios.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const filtered = useMemo(() => users.filter((user) =>
    `${user.displayName} ${user.email}`.toLowerCase().includes(query.toLowerCase())
    && (role === 'Todos' || roleLabels[user.role] === role),
  ), [users, query, role])

  async function save() {
    if (!editor) return
    if (!editor.cashRegisterId) {
      setError('Asigna una caja activa a cada usuario.')
      return
    }
    if (editor.categoryAccessRestricted && editor.active && editor.allowedCategoryIds.length === 0) {
      setError('Selecciona al menos una categoría o desactiva el límite por categorías.')
      return
    }
    const permissionNeeds: Array<[Permission, Permission]> = [
      ['pos:charge', 'pos:access'],
      ['pos:access', 'cash-register:own'],
      ['student:abono', 'student:read'],
      ['student:write', 'student:read'],
      ['inventory:write', 'inventory:read'],
      ['student:abono', 'pos:access'],
      ['cash-register:close', 'cash-register:own'],
      ['cash-register:close', 'admin:access'],
      ['cash-register:close', 'sales:read'],
      ['cash-register:close', 'student:read'],
    ]
    const missingPermission = permissionNeeds.find(([permission, prerequisite]) =>
      editor.permissions.includes(permission) && !editor.permissions.includes(prerequisite),
    )
    if (missingPermission) {
      setError(`El permiso “${missingPermission[0]}” requiere también “${missingPermission[1]}”.`)
      return
    }
    if (!editor.permissions.some((permission) => ['admin:access', 'pos:access', 'inventory:read'].includes(permission))) {
      setError('Asigna al menos un acceso principal: panel de gestión, punto de venta o consulta de inventario.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await saveManagedUser(editor)
      setEditor(null)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible guardar el usuario.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleUser() {
    if (!confirmation) return
    setSaving(true)
    setError('')
    try {
      await saveManagedUser({
        ...confirmation,
        active: !confirmation.active,
        categoryAccessRestricted: confirmation.categoryAccessRestricted,
        permissions: confirmation.permissions ?? rolePermissionDefaults(confirmation.role),
      })
      setConfirmation(null)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible actualizar el usuario.')
    } finally {
      setSaving(false)
    }
  }

  function editUser(user: ManagedUser) {
    setError('')
    setEditor({ ...user, permissions: user.permissions ?? rolePermissionDefaults(user.role), password: '' })
  }

  function rolePermissionDefaults(nextRole: ManagedRole): Permission[] {
    if (nextRole === 'administrator') return APP_PERMISSIONS.map(({ id }) => id)
    if (nextRole === 'inventory') return ['inventory:read', 'inventory:write', 'student:read']
    return ['admin:access', 'pos:access', 'pos:charge', 'cash-register:own', 'cash-register:close', 'student:read', 'student:abono', 'sales:read']
  }

  function rolePermissions(nextRole: ManagedRole) {
    if (nextRole === 'administrator') return APP_PERMISSIONS
    return APP_PERMISSIONS.filter(({ id }) => nextRole === 'cashier'
      ? !id.startsWith('inventory:')
      : !id.startsWith('pos:') && id !== 'student:abono')
  }

  return (
    <div className="admin-page-stack">
      <PageHeader
        eyebrow="Control de acceso"
        title="Usuarios y cajeros"
        description="Crea cuentas, define su rol y limita las categorías que pueden vender o administrar."
        action={<button className="admin-primary-button" onClick={() => { setError(''); setEditor(emptyEditor()) }} type="button"><Plus aria-hidden="true" className="size-5" />Nuevo usuario</button>}
      />
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700" role="alert">{error}</div>}
      <section className="admin-card">
        <div className="flex flex-col gap-3 md:flex-row">
          <SearchField onChange={setQuery} placeholder="Buscar por nombre o correo" value={query} />
          <div className="shrink-0 md:w-52">
            <select className="admin-select" onChange={(event) => setRole(event.target.value)} value={role}>
              {['Todos', ...Object.values(roleLabels)].map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
        </div>
        <div className="admin-table-wrap mt-4">
          <table className="admin-table">
            <thead><tr><th>Usuario</th><th>Rol</th><th>Caja</th><th>Categorías</th><th>Último acceso</th><th>Estado</th><th className="text-right">Acciones</th></tr></thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id}>
                  <td><strong>{user.displayName}</strong><span className="block text-xs text-slate-400">{user.email}</span></td>
                  <td><span className="inline-flex items-center gap-1 font-bold"><ShieldCheck aria-hidden="true" className="size-4 text-blue-600" />{user.isSuperAdmin ? 'Administrador superior' : roleLabels[user.role]}</span></td>
                  <td>{user.cashRegisterName ?? 'Sin caja'}</td>
                  <td>{user.role === 'administrator' || !user.categoryAccessRestricted
                    ? <span className="text-xs font-bold text-slate-500">Todas</span>
                    : <div className="flex flex-wrap gap-1">{user.allowedCategoryIds.map((id) => {
                      const category = categories.find((item) => item.id === id)
                      return <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold" key={id}>{category?.name ?? 'Categoría'}</span>
                    })}</div>}
                  </td>
                  <td>{formatLastAccess(user.lastSignInAt)}</td>
                  <td><StatusPill active={user.active} /></td>
                  <td><div className="flex justify-end gap-1">
                    <button className="admin-icon-button" onClick={() => editUser(user)} aria-label={`Editar ${user.displayName}`} type="button"><Pencil className="size-4" /></button>
                    <button className="admin-icon-button" onClick={() => { setError(''); setConfirmation(user) }} aria-label={`${user.active ? 'Desactivar' : 'Activar'} ${user.displayName}`} type="button"><Power className="size-4" /></button>
                  </div></td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && <tr><td className="py-8 text-center text-slate-500" colSpan={7}>No hay usuarios que coincidan con la búsqueda.</td></tr>}
            </tbody>
          </table>
        </div>
        {loading && <p className="mt-4 text-sm font-semibold text-slate-500">Cargando usuarios…</p>}
      </section>

      <AdminDialog
        open={Boolean(editor)}
        title={editor?.id ? 'Editar usuario' : 'Crear usuario'}
        description="Las credenciales se administran en Supabase Auth y el acceso se valida en la base de datos."
        onClose={() => !saving && setEditor(null)}
        size="lg"
        footer={<>
          <button className="admin-secondary-button" disabled={saving} onClick={() => setEditor(null)} type="button">Cancelar</button>
          <button className="admin-primary-button" disabled={saving} onClick={() => void save()} type="button">{saving ? 'Guardando…' : editor?.id ? 'Guardar cambios' : 'Crear cuenta'}</button>
        </>}
      >
        {editor && <div className="grid gap-4 sm:grid-cols-2">
          <label className="admin-field">Nombre completo<input className="admin-input" autoComplete="name" onChange={(event) => setEditor({ ...editor, displayName: event.target.value })} value={editor.displayName} /></label>
          <label className="admin-field">Correo electrónico<input className="admin-input" autoComplete="email" onChange={(event) => setEditor({ ...editor, email: event.target.value })} type="email" value={editor.email} /></label>
          <label className="admin-field">{editor.id ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'}<input className="admin-input" autoComplete="new-password" minLength={8} onChange={(event) => setEditor({ ...editor, password: event.target.value })} required={!editor.id} type="password" value={editor.password} /></label>
          <label className="admin-field">Rol<select className="admin-select" onChange={(event) => { const nextRole = event.target.value as ManagedRole; setEditor({ ...editor, role: nextRole, isSuperAdmin: nextRole === 'administrator' ? editor.isSuperAdmin : false, permissions: rolePermissionDefaults(nextRole) }) }} value={editor.role}>{roleValues.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="admin-field">Caja asignada<select className="admin-select" onChange={(event) => setEditor({ ...editor, cashRegisterId: event.target.value || null })} value={editor.cashRegisterId ?? ''}><option value="">Selecciona una caja</option>{registers.filter((register) => register.active).map((register) => <option key={register.id} value={register.id}>{register.name}</option>)}</select></label>
          {isSuperAdmin && editor.role === 'administrator' && <label className="flex min-h-11 items-center gap-3 rounded-lg border border-violet-200 bg-violet-50 px-3 text-sm font-bold text-violet-950 sm:col-span-2"><input checked={editor.isSuperAdmin} onChange={(event) => setEditor({ ...editor, isSuperAdmin: event.target.checked })} type="checkbox" /><ShieldCheck className="size-4" />Administrador superior: acceso a todos los colegios y gestión de permisos de red</label>}
          <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm font-bold sm:col-span-2"><input checked={editor.active} onChange={(event) => setEditor({ ...editor, active: event.target.checked })} type="checkbox" />Cuenta activa</label>
          {editor.role !== 'administrator' && <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-black text-slate-800">Permisos por módulo y operación</legend>
            <p className="mb-3 text-xs font-semibold text-slate-500">Elige exactamente qué puede hacer esta cuenta. Los cambios aplican también en la base de datos.</p>
            <div className="grid gap-3 md:grid-cols-2">
              {[...new Set(rolePermissions(editor.role).map(({ group }) => group))].map((group) => <section className="rounded-xl border border-slate-200 p-3" key={group}>
                <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">{group}</h3>
                <div className="grid gap-2">{rolePermissions(editor.role).filter((permission) => permission.group === group).map(({ id, label, description }) => <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-slate-50 p-2.5" key={id}>
                  <input checked={editor.permissions.includes(id)} className="mt-0.5" onChange={(event) => setEditor({ ...editor, permissions: event.target.checked ? [...new Set([...editor.permissions, id])] : editor.permissions.filter((permission) => permission !== id) })} type="checkbox" />
                  <span><strong className="block text-xs text-slate-800">{label}</strong><span className="text-[11px] font-medium text-slate-500">{description}</span></span>
                </label>)}</div>
              </section>)}
            </div>
          </fieldset>}
          {editor.role !== 'administrator' && <div className="sm:col-span-2">
            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm font-bold"><input checked={editor.categoryAccessRestricted} onChange={(event) => setEditor({ ...editor, categoryAccessRestricted: event.target.checked, allowedCategoryIds: event.target.checked ? editor.allowedCategoryIds : [] })} type="checkbox" /><KeyRound aria-hidden="true" className="size-4 text-slate-500" />Limitar acceso a categorías seleccionadas</label>
            {editor.categoryAccessRestricted && <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{categories.filter((category) => category.active).map((category) => <label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold" key={category.id}><input checked={editor.allowedCategoryIds.includes(category.id)} onChange={(event) => setEditor({ ...editor, allowedCategoryIds: event.target.checked ? [...editor.allowedCategoryIds, category.id] : editor.allowedCategoryIds.filter((id) => id !== category.id) })} type="checkbox" />{category.name}</label>)}</div>}
          </div>}
        </div>}
      </AdminDialog>

      <AdminDialog open={Boolean(confirmation)} title="Confirmar cambio de estado" description="Al desactivar un usuario, sus permisos de base de datos dejarán de aplicarse." onClose={() => !saving && setConfirmation(null)} size="sm" footer={<>
        <button className="admin-secondary-button" disabled={saving} onClick={() => setConfirmation(null)} type="button">Cancelar</button>
        <button className="admin-danger-button" disabled={saving} onClick={() => void toggleUser()} type="button">{saving ? 'Guardando…' : 'Confirmar'}</button>
      </>}>
        <p className="font-semibold text-slate-600">Se {confirmation?.active ? 'desactivará' : 'activará'} la cuenta de <strong>{confirmation?.displayName}</strong>.</p>
      </AdminDialog>
    </div>
  )
}
