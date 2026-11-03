import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, Download, Package, RefreshCw, Store } from 'lucide-react'

import { SALES_CHANGED_EVENT, listRegisterCloseTransactions, type RegisterCloseTransaction } from '../../sales'
import { STUDENTS_CHANGED_EVENT } from '../../students'
import { useAuth } from '../../auth'
import { formatAdminCurrency } from '../format'
import { EmptyState, PageHeader, StatusPill } from '../components/AdminUi'

function localDateValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function dateRange(value: string) {
  const start = new Date(`${value}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { from: start.toISOString(), until: end.toISOString() }
}

export function CashCloseSection() {
  const { session } = useAuth()
  const registerId = session?.user.cashRegisterId
  const [date, setDate] = useState(() => localDateValue(new Date()))
  const [transactions, setTransactions] = useState<RegisterCloseTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!registerId) {
      setTransactions([])
      setError('Esta cuenta no tiene una caja asignada. Pide al administrador que la vincule a una caja activa.')
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const range = dateRange(date)
      setTransactions(await listRegisterCloseTransactions(registerId, range.from, range.until))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible generar el cierre.')
    } finally {
      setLoading(false)
    }
  }, [date, registerId])

  useEffect(() => {
    void refresh()
    window.addEventListener(SALES_CHANGED_EVENT, refresh)
    window.addEventListener(STUDENTS_CHANGED_EVENT, refresh)
    return () => {
      window.removeEventListener(SALES_CHANGED_EVENT, refresh)
      window.removeEventListener(STUDENTS_CHANGED_EVENT, refresh)
    }
  }, [refresh])

  const summary = useMemo(() => {
    const sales = transactions.filter((item) => item.kind === 'sale' && item.status === 'completed')
    const cancelled = transactions.filter((item) => item.kind === 'sale' && item.status === 'voided')
    const cashSales = sales.filter((item) => item.paymentMethod === 'cash').reduce((sum, item) => sum + item.amount, 0)
    const accountSales = sales.filter((item) => item.paymentMethod === 'student-account').reduce((sum, item) => sum + item.amount, 0)
    const deposits = transactions.filter((item) => item.kind === 'abono').reduce((sum, item) => sum + item.amount, 0)
    const products = new Map<string, number>()
    sales.forEach((sale) => sale.items.forEach((item) => products.set(item.productName, (products.get(item.productName) ?? 0) + item.quantity)))
    return { sales: sales.length, cancelled: cancelled.length, cashSales, accountSales, deposits, cashExpected: cashSales + deposits, products: [...products].sort((a, b) => b[1] - a[1]) }
  }, [transactions])

  function printReport() {
    const cleanup = () => document.body.classList.remove('printing-close-report')
    document.body.classList.add('printing-close-report')
    window.addEventListener('afterprint', cleanup, { once: true })
    window.print()
    window.setTimeout(cleanup, 3000)
  }

  return <div className="admin-page-stack cash-close-report">
    <PageHeader
      eyebrow="Operación diaria"
      title="Cierre de caja"
      description="Revisa las ventas, los abonos recibidos y los productos registrados en tu caja."
      action={<div className="no-print flex flex-wrap gap-2"><button className="admin-secondary-button" onClick={() => void refresh()} type="button"><RefreshCw className="size-4" />Actualizar</button><button className="admin-primary-button" disabled={!transactions.length} onClick={printReport} type="button"><Download className="size-4" />Imprimir reporte</button></div>}
    />
    <section className="admin-card flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Store aria-hidden="true" /></span><div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Caja asignada</p><h2 className="text-lg font-black text-slate-950">{session?.user.cashRegisterName ?? 'Sin caja asignada'}</h2><p className="text-sm font-semibold text-slate-500">Responsable: {session?.user.displayName}</p></div></div>
      <label className="admin-field no-print">Fecha del cierre<input className="admin-input" max={localDateValue(new Date())} onChange={(event) => setDate(event.target.value)} type="date" value={date} /></label>
      <div className="print-only hidden text-sm font-bold text-slate-600">Fecha: {date}</div>
    </section>
    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700" role="alert">{error}</div>}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ['Ventas completadas', summary.sales.toString()],
        ['Efectivo de ventas', formatAdminCurrency(summary.cashSales)],
        ['Abonos y recargas', formatAdminCurrency(summary.deposits)],
        ['Total a entregar', formatAdminCurrency(summary.cashExpected)],
      ].map(([label, value], index) => <article className={`admin-card ${index === 3 ? 'border-emerald-300 bg-emerald-50' : ''}`} key={label}><p className="text-sm font-bold text-slate-500">{label}</p><p className={`mt-2 text-2xl font-black ${index === 3 ? 'text-emerald-800' : 'text-slate-950'}`}>{value}</p></article>)}
    </section>
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.7fr)]">
      <article className="admin-card min-w-0">
        <div className="flex items-center justify-between gap-3"><div><h2 className="admin-card-title">Transacciones</h2><p className="admin-card-subtitle">Ventas, consumos de estudiantes y pagos recibidos</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{loading ? 'Actualizando…' : `${transactions.length} registros`}</span></div>
        {loading ? <p className="py-10 text-center text-sm font-semibold text-slate-500">Cargando movimientos…</p> : transactions.length === 0 ? <EmptyState>No hay transacciones para esta caja y fecha.</EmptyState> : <div className="mt-4 space-y-3">{transactions.map((item) => <article className="rounded-xl border border-slate-200 p-3 sm:p-4" key={`${item.kind}-${item.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-xs font-black ${item.kind === 'abono' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-50 text-blue-800'}`}>{item.concept}</span>{item.status && <StatusPill active={item.status === 'completed'} activeText="Completada" inactiveText="Anulada" />}</div><h3 className="mt-2 truncate font-black text-slate-900">{item.customer ?? item.concept}</h3><p className="text-xs font-semibold text-slate-500">{new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' }).format(new Date(item.occurredAt))} · {item.paymentMethod === 'cash' ? 'Efectivo' : item.paymentMethod === 'student-account' ? 'Cuenta estudiante' : item.kind === 'abono' ? 'Pago recibido' : ''}</p></div><strong className={`text-lg font-black ${item.status === 'voided' ? 'text-slate-400 line-through' : 'text-slate-950'}`}>{formatAdminCurrency(item.amount)}</strong></div>
          {item.items.length > 0 && <ul className="mt-3 grid gap-1 border-t border-slate-100 pt-2 text-sm sm:grid-cols-2">{item.items.map((line, index) => <li className="flex min-w-0 items-center gap-2 text-slate-600" key={`${line.productName}-${index}`}><Package aria-hidden="true" className="size-4 shrink-0 text-slate-400" /><span className="min-w-0 flex-1 truncate">{item.kind === 'sale' ? `${line.quantity} × ${line.productName}` : line.productName}</span><span className="shrink-0 font-bold">{formatAdminCurrency(line.lineTotal)}</span></li>)}</ul>}
        </article>)}</div>}
      </article>
      <article className="admin-card">
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-sky-50 text-sky-700"><ClipboardCheck aria-hidden="true" /></span><div><h2 className="admin-card-title">Resumen de cierre</h2><p className="admin-card-subtitle">Cifras del día seleccionado</p></div></div>
        <dl className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 px-3">
          <div className="flex justify-between gap-3 py-3 text-sm"><dt className="font-semibold text-slate-600">Ventas en cuenta estudiante</dt><dd className="font-black">{formatAdminCurrency(summary.accountSales)}</dd></div>
          <div className="flex justify-between gap-3 py-3 text-sm"><dt className="font-semibold text-slate-600">Ventas anuladas</dt><dd className="font-black text-rose-600">{summary.cancelled}</dd></div>
          <div className="flex justify-between gap-3 py-3 text-sm"><dt className="font-semibold text-slate-600">Movimientos incluidos</dt><dd className="font-black">{summary.sales + transactions.filter((item) => item.kind === 'abono').length}</dd></div>
        </dl>
        <h3 className="mt-5 flex items-center gap-2 font-black text-slate-900"><Package aria-hidden="true" className="size-5 text-blue-600" />Productos vendidos</h3>
        {summary.products.length ? <ul className="mt-2 divide-y divide-slate-100">{summary.products.map(([name, quantity]) => <li className="flex justify-between gap-3 py-2 text-sm" key={name}><span className="truncate font-semibold text-slate-700">{name}</span><strong>{quantity} uds.</strong></li>)}</ul> : <p className="mt-2 text-sm font-medium text-slate-500">Sin productos vendidos.</p>}
        <p className="no-print mt-5 rounded-lg bg-amber-50 p-3 text-xs font-semibold leading-relaxed text-amber-900">El total a entregar suma las ventas en efectivo y los abonos recibidos. Los consumos cargados a cuentas estudiantiles se muestran por separado.</p>
      </article>
    </section>
  </div>
}
