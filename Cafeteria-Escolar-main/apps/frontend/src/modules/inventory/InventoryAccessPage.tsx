import { Boxes, LogOut } from 'lucide-react'

import { useAuth } from '../auth'
import { InventorySection } from './InventorySection'

export function InventoryAccessPage() {
  const { session, logout } = useAuth()
  return <main className="inventory-access-page"><header className="inventory-topbar"><Boxes aria-hidden="true" className="size-7" /><div className="min-w-0 flex-1"><h1>Café·Escuela <span className="font-medium text-white/60">/ Inventarios</span></h1><p className="truncate">{session?.user.displayName} · Control de productos y existencias</p></div><a className="inventory-back-link" href="#/pos">Punto de venta</a><button aria-label="Cerrar sesión" className="inline-flex min-h-11 items-center gap-2 px-3 font-bold" onClick={() => void logout()} type="button"><LogOut aria-hidden="true" className="size-5" /><span className="hidden sm:inline">Salir</span></button></header><div className="mx-auto max-w-[1600px] p-3 sm:p-5 lg:p-7"><InventorySection /></div></main>
}
