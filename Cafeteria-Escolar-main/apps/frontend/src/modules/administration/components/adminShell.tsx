import { useEffect, useState } from "react";
import {
  BarChart3,
  BookOpenCheck,
  Boxes,
  ClipboardCheck,
  CircleDollarSign,
  FileChartColumn,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Utensils,
  Users,
  UsersRound,
  Wifi,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";

import type { AdministrationSection } from "../types";
import { useAuth } from "../../auth";

interface NavigationItem {
  id: AdministrationSection;
  label: string;
  icon: LucideIcon;
  permission: import('../../auth/types').Permission | 'admin:access'
}

const navigation: NavigationItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "reports:read" },
  { id: "students", label: "Estudiantes", icon: UsersRound, permission: "student:read" },
  { id: "balances", label: "Saldos y deudas", icon: CircleDollarSign, permission: "student:read" },
  { id: "inventory", label: "Inventarios", icon: Boxes, permission: "inventory:read" },
  { id: "users", label: "Usuarios y cajeros", icon: ShieldCheck, permission: "admin:access" },
  { id: "registers", label: "Cajas", icon: Store, permission: "admin:access" },
  { id: "closure", label: "Cierre", icon: ClipboardCheck, permission: "cash-register:close" },
  { id: "sales", label: "Ventas", icon: ShoppingBag, permission: "sales:read" },
  { id: "reports", label: "Reportes", icon: FileChartColumn, permission: "reports:read" },
  { id: "settings", label: "Configuración", icon: Settings, permission: "admin:access" },
];

interface AdminShellProps {
  activeSection: AdministrationSection;
  onSectionChange: (section: AdministrationSection) => void;
  children: React.ReactNode;
}

export function AdminShell({
  activeSection,
  onSectionChange,
  children,
}: AdminShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const { session, logout, can } = useAuth();
  const permittedNavigation = navigation.filter(({ id, permission }) =>
    (session?.user.role === "administrator" || !["users", "registers", "settings"].includes(id))
    && can(permission),
  );
  const activeItem = navigation.find((item) => item.id === activeSection);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  function selectSection(section: AdministrationSection) {
    onSectionChange(section);
    setMenuOpen(false);
  }

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      await logout();
    } catch (cause) {
      setLogoutError(
        cause instanceof Error
          ? cause.message
          : "No fue posible cerrar la sesión.",
      );
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="admin-shell flex h-dvh min-h-0 min-w-0 overflow-hidden bg-slate-100 text-slate-900">
      {menuOpen && (
        <button
          aria-label="Cerrar menú"
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMenuOpen(false)}
          type="button"
        />
      )}

      <aside
        className={`admin-sidebar fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-gradient-to-b from-blue-800 via-blue-900 to-slate-950 text-white shadow-2xl transition-transform lg:static lg:z-auto lg:w-20 lg:translate-x-0 lg:shadow-none xl:w-72 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-20 shrink-0 items-center gap-3 border-b border-white/10 px-4 lg:justify-center lg:px-2 xl:justify-start xl:px-5">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15">
            <Utensils aria-hidden="true" className="size-7" />
          </div>
          <div className="min-w-0 lg:hidden xl:block">
            <strong className="block truncate text-lg font-black">
              Café·Escuela
            </strong>
            <span className="text-xs font-semibold text-blue-200">
              Administración
            </span>
          </div>
          <button
            aria-label="Cerrar menú"
            className="ml-auto grid size-11 place-items-center rounded-lg hover:bg-white/10 lg:hidden"
            onClick={() => setMenuOpen(false)}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
        </div>

        <nav
          className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4 lg:px-2 xl:px-3"
          aria-label="Navegación administrativa"
          id="admin-navigation"
        >
          {permittedNavigation.map(({ id, label, icon: Icon }) => (
            <button
              aria-current={activeSection === id ? "page" : undefined}
              className={`flex min-h-12 w-full min-w-0 items-center gap-3 rounded-xl px-3 text-left text-sm font-bold transition lg:justify-center lg:px-2 xl:justify-start xl:px-3 ${activeSection === id ? "bg-white text-blue-800 shadow-md" : "text-blue-100 hover:bg-white/10 hover:text-white"}`}
              key={id}
              onClick={() => selectSection(id)}
              title={label}
              type="button"
            >
              <Icon aria-hidden="true" className="size-5 shrink-0" />
              <span className="lg:hidden xl:inline">{label}</span>
            </button>
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/10 p-3 lg:p-2 xl:p-3">
          <a
            className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-bold text-blue-100 transition hover:bg-white/10 hover:text-white lg:justify-center lg:px-2 xl:justify-start xl:px-3"
            href="#/pos"
            title="Volver al punto de venta"
          >
            <PanelLeftClose aria-hidden="true" className="size-5 shrink-0" />
            <span className="lg:hidden xl:inline">Volver al POS</span>
          </a>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-20 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 shadow-sm sm:px-5">
          <div className="lg:hidden">
            <button
              aria-controls="admin-navigation"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "Cerrar navegación" : "Abrir navegación"}
              className="admin-icon-button"
              onClick={() => setMenuOpen((open) => !open)}
              type="button"
            >
              <Menu aria-hidden="true" className="size-6" />
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-black uppercase tracking-[0.12em] text-blue-700">
              {activeItem?.label ?? "Administración"}
            </p>
            <p className="truncate text-sm font-black text-slate-950">
              {session?.user.displayName}
            </p>
            <p className="hidden truncate text-xs font-semibold text-slate-500 sm:block">
              {session?.user.role === "administrator" ? "Administrador" : session?.user.role === "cashier" ? "Cajero" : "Inventarios"} · Sesión verificada por Supabase
            </p>
          </div>
          <div className="hidden items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600 sm:flex">
            <BookOpenCheck
              aria-hidden="true"
              className="size-4 text-blue-600"
            />
            {new Intl.DateTimeFormat("es-CO", {
              day: "numeric",
              month: "short",
              year: "numeric",
            }).format(now)}
          </div>
          <div
            aria-live="polite"
            className={`flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-black sm:text-sm ${online ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
            title={
              online
                ? "El dispositivo tiene conexión a internet"
                : "El dispositivo no tiene conexión a internet"
            }
          >
            {online ? (
              <Wifi aria-hidden="true" className="size-5" />
            ) : (
              <WifiOff aria-hidden="true" className="size-5" />
            )}
            <span className="hidden sm:inline">
              {online ? "En línea" : "Sin conexión"}
            </span>
          </div>
          <button
            aria-label="Cerrar sesión"
            className="admin-icon-button"
            disabled={loggingOut}
            onClick={() => void handleLogout()}
            title="Cerrar sesión"
            type="button"
          >
            <LogOut aria-hidden="true" className="size-5" />
          </button>
        </header>

        {logoutError && (
          <p
            className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700"
            role="alert"
          >
            {logoutError}
          </p>
        )}
        <main
          className="admin-content min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-5 lg:p-6"
          key={activeSection}
        >
          <div aria-label={activeItem?.label ?? "Sección administrativa"}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export const adminVisualIcons = { BarChart3, Boxes, Users };
