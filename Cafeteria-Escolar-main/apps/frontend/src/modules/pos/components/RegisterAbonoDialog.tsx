import { useState } from 'react'
import { CircleDollarSign, X } from 'lucide-react'

import { formatCurrency } from '../format'
import type { Student } from '../types'

interface Props {
  student: Student
  busy: boolean
  onClose: () => void
  onSubmit: (amount: number, detail: string) => Promise<void>
}

export function RegisterAbonoDialog({ student, busy, onClose, onSubmit }: Props) {
  const [amount, setAmount] = useState('')
  const [detail, setDetail] = useState('Abono recibido en caja')
  const remainingDebt = student.debt
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section aria-labelledby="abono-title" aria-modal="true" className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl" role="dialog">
      <header className="flex items-center gap-3 bg-gradient-to-r from-emerald-700 to-teal-600 px-5 py-4 text-white">
        <CircleDollarSign aria-hidden="true" className="size-6" />
        <div className="min-w-0 flex-1"><h2 className="text-lg font-black" id="abono-title">Registrar abono</h2><p className="truncate text-sm font-semibold text-emerald-50">{student.name} · {student.course}</p></div>
        <button aria-label="Cerrar" className="grid size-10 place-items-center rounded-lg hover:bg-white/15" disabled={busy} onClick={onClose} type="button"><X aria-hidden="true" /></button>
      </header>
      <form className="grid gap-4 p-5" onSubmit={(event) => { event.preventDefault(); void onSubmit(Number(amount), detail) }}>
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><span className="text-sm font-bold text-slate-600">{remainingDebt > 0 ? 'Deuda actual' : 'Saldo actual'}</span><strong className="text-lg font-black text-slate-900">{formatCurrency(remainingDebt > 0 ? remainingDebt : student.balance)}</strong></div>
        <label className="grid gap-1.5 text-sm font-bold text-slate-700">Valor del abono
          <input autoFocus className="min-h-12 rounded-lg border border-slate-300 px-3 text-lg font-black text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" inputMode="numeric" min="1" onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ''))} placeholder="$ 0" required type="text" value={amount} />
        </label>
        <label className="grid gap-1.5 text-sm font-bold text-slate-700">Detalle<input className="min-h-11 rounded-lg border border-slate-300 px-3 font-semibold outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" maxLength={120} onChange={(event) => setDetail(event.target.value)} required value={detail} /></label>
        <div className="mt-1 grid grid-cols-2 gap-2"><button className="min-h-11 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-50" disabled={busy} onClick={onClose} type="button">Cancelar</button><button className="min-h-11 rounded-lg bg-emerald-700 font-black text-white hover:bg-emerald-800 disabled:opacity-50" disabled={busy || Number(amount) <= 0} type="submit">{busy ? 'Guardando…' : 'Confirmar abono'}</button></div>
      </form>
    </section>
  </div>
}
