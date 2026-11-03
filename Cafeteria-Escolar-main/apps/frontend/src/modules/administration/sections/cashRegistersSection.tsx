import { useCallback, useEffect, useState } from 'react'
import { Banknote, Pencil, Plus, RefreshCw, ShoppingBag, Store, Undo2 } from 'lucide-react'

import { listCashRegisterSummaries, SALES_CHANGED_EVENT, type CashRegisterSummary } from '../../sales'
import { formatAdminCurrency } from '../format'
import { AdminDialog, EmptyState, PageHeader, StatusPill } from '../components/AdminUi'
import {
  listManagedCashRegisters,
  listManagedUsers,
  saveManagedCashRegister,
  type ManagedCashRegister,
  type ManagedUser,
} from '../services/adminManagementService'

interface RegisterEditor {
  id?: string
  name: string
  active: boolean
  userId: string
}

const roleLabels: Record<ManagedUser['role'], string> = {
  administrator: 'Administrador',
  cashier: 'Cajero',
  inventory: 'Inventarios',
}

function blankEditor(): RegisterEditor {
  return { name: '', active: true, userId: '' }
}

export function CashRegistersSection() {
  const [registers, setRegisters] = useState<Array<ManagedCashRegister & Partial<CashRegisterSummary>>>([])
  const [cashiers, setCashiers] = useState<ManagedUser[]>([])
  const [editor, setEditor] = useState<RegisterEditor | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [managed, summaries, users] = await Promise.all([
        listManagedCashRegisters(),
        listCashRegisterSummaries(),
        listManagedUsers(),
      ])
      const summaryById = new Map(summaries.map((summary) => [summary.id, summary]))
      setRegisters(managed.map((register) => ({ ...register, ...summaryById.get(register.id) })))
      setCashiers(users.filter((user) => user.active))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar las cajas.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    window.addEventListener(SALES_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(SALES_CHANGED_EVENT, refresh)
  }, [refresh])

  async function save() {
    if (!editor) return
    setSaving(true)
    setError('')
    try {
      await saveManagedCashRegister({
        id: editor.id,
        name: editor.name,
        active: editor.active,
        userId: editor.userId || null,
      })
      setEditor(null)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible guardar la caja.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-page-stack">
      <PageHeader
        eyebrow="Operación de caja"
        title="Cajas"
        description="Crea y edita cajas, asigna cajeros y consulta el recaudo confirmado."
        action={<div className="flex gap-2"><button className="admin-secondary-button" onClick={() => void refresh()} type="button"><RefreshCw className="size-4" />Actualizar</button><button className="admin-primary-button" onClick={() => { setError(''); setEditor(blankEditor()) }} type="button"><Plus className="size-4" />Nueva caja</button></div>}
      />
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700" role="alert">{error}</div>}
      {loading && <p className="text-sm font-semibold text-slate-500">Cargando cajas…</p>}
      {!loading && registers.length === 0 && !error && <EmptyState>No hay cajas. Crea una para asignarla a un cajero.</EmptyState>}
      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {registers.map((register) => (
          <article className="admin-card" key={register.id}>
            <div className="flex items-start gap-3">
              <div className={`grid size-12 place-items-center rounded-xl ${register.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}><Store /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2"><h2 className="admin-card-title">{register.name}</h2><StatusPill active={register.active} activeText="Activa" inactiveText="Inactiva" /></div>
                <p className="admin-card-subtitle">{register.assignedUsers.length ? `Asignada a ${register.assignedUsers.map((user) => user.name).join(', ')}` : 'Sin usuarios asignados'}</p>
              </div>
              <button aria-label={`Editar ${register.name}`} className="admin-icon-button" onClick={() => { setError(''); setEditor({ id: register.id, name: register.name, active: register.active, userId: register.assignedUsers.find((user) => user.role === 'cashier')?.id ?? '' }) }} type="button"><Pencil className="size-4" /></button>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
              <div className="col-span-2"><dt className="flex items-center gap-1 font-bold text-slate-500"><Banknote className="size-4" />Recaudo efectivo</dt><dd className="mt-1 text-2xl font-black text-emerald-700">{formatAdminCurrency(register.cashTotal ?? 0)}</dd></div>
              <div><dt className="flex items-center gap-1 font-bold text-slate-400"><ShoppingBag className="size-4" />Ventas vigentes</dt><dd className="mt-1 text-xl font-black">{register.completedSales ?? 0}</dd></div>
              <div><dt className="flex items-center gap-1 font-bold text-slate-400"><Undo2 className="size-4" />Anuladas</dt><dd className="mt-1 text-xl font-black text-rose-600">{register.voidedSales ?? 0}</dd></div>
            </dl>
          </article>
        ))}
      </section>

      <AdminDialog open={Boolean(editor)} title={editor?.id ? 'Editar caja' : 'Crear caja'} description="Asocia un usuario activo. Cada cuenta operativa debe tener una caja asignada." onClose={() => !saving && setEditor(null)} size="md" footer={<>
        <button className="admin-secondary-button" disabled={saving} onClick={() => setEditor(null)} type="button">Cancelar</button>
        <button className="admin-primary-button" disabled={saving} onClick={() => void save()} type="button">{saving ? 'Guardando…' : 'Guardar caja'}</button>
      </>}>
        {editor && <div className="grid gap-4">
          <label className="admin-field">Nombre de la caja<input autoFocus className="admin-input" maxLength={80} onChange={(event) => setEditor({ ...editor, name: event.target.value })} value={editor.name} /></label>
          <label className="admin-field">Usuario asociado<select className="admin-select" disabled={!editor.active} onChange={(event) => setEditor({ ...editor, userId: event.target.value })} value={editor.userId}><option value="">Sin cambios</option>{cashiers.map((cashier) => <option key={cashier.id} value={cashier.id}>{cashier.displayName} · {roleLabels[cashier.role]} · {cashier.email}</option>)}</select><span className="text-xs font-medium text-slate-500">Al guardar, se actualizará la caja asignada a esa cuenta.</span></label>
          <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm font-bold"><input checked={editor.active} onChange={(event) => setEditor({ ...editor, active: event.target.checked, userId: event.target.checked ? editor.userId : '' })} type="checkbox" />Caja activa</label>
        </div>}
      </AdminDialog>
    </div>
  )
}
