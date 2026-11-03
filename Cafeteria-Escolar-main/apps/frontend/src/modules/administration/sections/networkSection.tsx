import { useCallback, useEffect, useState } from 'react'
import { Building2, CircleAlert, Coffee, Plus, Power, RefreshCw, School } from 'lucide-react'

import { requireSupabase } from '../../../infrastructure/supabase/client'
import { AdminDialog, PageHeader, StatusPill } from '../components/AdminUi'

interface NetworkCafeteria { id: string; name: string; active: boolean }
interface NetworkSchool { id: string; name: string; active: boolean; cafeterias: NetworkCafeteria[] }

export function NetworkSection() {
  const [schools, setSchools] = useState<NetworkSchool[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [cafeteriaDraft, setCafeteriaDraft] = useState<{ schoolId: string; name: string } | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error: queryError } = await requireSupabase().from('schools')
        .select('id,name,active,cafeterias(id,name,active)').order('name')
      if (queryError) throw queryError
      setSchools((data ?? []) as unknown as NetworkSchool[])
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar la red escolar.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  async function createSchool() {
    const name = schoolName.trim()
    if (name.length < 2) { setError('Escribe el nombre del colegio.'); return }
    setSaving(true); setError('')
    try {
      const { error: insertError } = await requireSupabase().from('schools').insert({ name })
      if (insertError) throw insertError
      setSchoolName(''); await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible crear el colegio.') }
    finally { setSaving(false) }
  }

  async function createCafeteria() {
    if (!cafeteriaDraft) return
    const name = cafeteriaDraft.name.trim()
    if (name.length < 2) { setError('Escribe el nombre de la cafetería.'); return }
    setSaving(true); setError('')
    try {
      const { error: insertError } = await requireSupabase().from('cafeterias').insert({ school_id: cafeteriaDraft.schoolId, name })
      if (insertError) throw insertError
      setCafeteriaDraft(null); await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible crear la cafetería.') }
    finally { setSaving(false) }
  }

  async function toggleActive(table: 'schools' | 'cafeterias', id: string, active: boolean) {
    setError('')
    const { error: updateError } = await requireSupabase().from(table).update({ active: !active }).eq('id', id)
    if (updateError) setError(updateError.message)
    else await refresh()
  }

  return <div className="admin-page-stack">
    <PageHeader eyebrow="Administración central" title="Red de colegios" description="Organiza los colegios, sus cafeterías y las cajas. Cada cafetería mantiene separados sus estudiantes, productos, ventas y usuarios." action={<button className="admin-secondary-button" onClick={() => void refresh()} type="button"><RefreshCw className="size-4" />Actualizar</button>} />
    {error && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700" role="alert"><CircleAlert className="mt-0.5 size-4 shrink-0" />{error}</div>}
    <section className="admin-card">
      <h2 className="admin-card-title">Agregar colegio</h2>
      <p className="admin-card-subtitle">El colegio es la unidad principal de la red.</p>
      <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void createSchool() }}>
        <input className="admin-input" aria-label="Nombre del colegio" placeholder="Ej. Colegio San José" value={schoolName} onChange={(event) => setSchoolName(event.target.value)} />
        <button className="admin-primary-button shrink-0" disabled={saving} type="submit"><Plus className="size-5" />Crear colegio</button>
      </form>
    </section>
    {loading ? <section className="admin-card text-sm font-semibold text-slate-500">Cargando colegios…</section> : schools.length === 0 ? <section className="admin-card text-sm font-semibold text-slate-500">Todavía no hay colegios en la red.</section> : <div className="grid gap-4 xl:grid-cols-2">
      {schools.map((school) => <section className="admin-card" key={school.id}>
        <header className="flex flex-wrap items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><School className="size-5" /></span>
          <div className="min-w-0 flex-1"><h2 className="admin-card-title">{school.name}</h2><p className="admin-card-subtitle">{school.cafeterias.length} cafetería(s)</p></div>
          <StatusPill active={school.active} />
          <button className="admin-icon-button" aria-label={`${school.active ? 'Desactivar' : 'Activar'} ${school.name}`} onClick={() => void toggleActive('schools', school.id, school.active)} type="button"><Power className="size-4" /></button>
          <button className="admin-secondary-button" onClick={() => setCafeteriaDraft({ schoolId: school.id, name: '' })} type="button"><Plus className="size-4" />Cafetería</button>
        </header>
        <div className="mt-4 grid gap-2">
          {school.cafeterias.map((cafeteria) => <article className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 p-3" key={cafeteria.id}>
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><Coffee className="size-4" /></span>
            <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-black text-slate-800">{cafeteria.name}</h3><p className="text-xs font-semibold text-slate-500">Cajas y perfiles asociados a esta cafetería</p></div>
            <StatusPill active={cafeteria.active} />
            <button className="admin-icon-button" aria-label={`${cafeteria.active ? 'Desactivar' : 'Activar'} ${cafeteria.name}`} onClick={() => void toggleActive('cafeterias', cafeteria.id, cafeteria.active)} type="button"><Power className="size-4" /></button>
          </article>)}
          {school.cafeterias.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm font-semibold text-slate-500">Agrega la primera cafetería de este colegio.</p>}
        </div>
      </section>)}
    </div>}
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm font-semibold text-blue-900"><div className="flex items-start gap-2"><Building2 className="mt-0.5 size-4 shrink-0" /><p>Los usuarios y cajas se asignan desde sus secciones. Para cambiar a qué cafetería pertenece una caja, selecciónala al crear o editar el perfil del usuario.</p></div></div>
    <AdminDialog open={Boolean(cafeteriaDraft)} title="Agregar cafetería" description="La cafetería quedará dentro del colegio seleccionado." onClose={() => !saving && setCafeteriaDraft(null)} footer={<><button className="admin-secondary-button" disabled={saving} onClick={() => setCafeteriaDraft(null)} type="button">Cancelar</button><button className="admin-primary-button" disabled={saving} onClick={() => void createCafeteria()} type="button">{saving ? 'Guardando…' : 'Crear cafetería'}</button></>}>
      <label className="admin-field">Nombre de la cafetería<input autoFocus className="admin-input" value={cafeteriaDraft?.name ?? ''} onChange={(event) => setCafeteriaDraft((draft) => draft ? { ...draft, name: event.target.value } : draft)} placeholder="Ej. Cafetería principal" /></label>
    </AdminDialog>
  </div>
}
