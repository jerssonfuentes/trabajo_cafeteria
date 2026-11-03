import { useState } from "react";

import { AdminShell } from "./components/adminShell";
import { BalancesSection } from "./sections/balancesSection";
import { CashRegistersSection } from "./sections/cashRegistersSection";
import { DashboardSection } from "./sections/dashboardSection";
import { ReportsSection } from "./sections/reportsSection";
import { SalesSection } from "./sections/salesSection";
import { SettingsSection } from "./sections/settingsSection";
import { StudentsManagementSection } from "./sections/studentsManagementSection";
import { UsersSection } from "./sections/usersSection";
import { InventorySection } from "../inventory";
import type { AdministrationSection } from "./types";
import { useAuth } from "../auth";
import type { Permission } from "../auth/types";

const sectionPermissions: Record<AdministrationSection, Permission> = {
  dashboard: "reports:read",
  students: "student:read",
  balances: "student:read",
  inventory: "inventory:read",
  users: "admin:access",
  registers: "admin:access",
  sales: "sales:read",
  reports: "reports:read",
  settings: "admin:access",
};

export function AdministrationPage() {
  const { session, can } = useAuth();
  const adminOnly: AdministrationSection[] = ["users", "registers", "settings"];
  const visible = (section: AdministrationSection) => (
    session?.user.role === "administrator" || !adminOnly.includes(section)
  ) && can(sectionPermissions[section]);
  const firstAllowed = (Object.keys(sectionPermissions) as AdministrationSection[]).find(visible) ?? "students";
  const [activeSection, setActiveSection] = useState<AdministrationSection>(() => {
    const requested = window.location.hash.startsWith("#/admin/students") ? "students" : "dashboard";
    return visible(requested) ? requested : firstAllowed;
  });

  const sections: Record<AdministrationSection, React.ReactNode> = {
    dashboard: <DashboardSection />,
    students: <StudentsManagementSection />,
    balances: <BalancesSection />,
    inventory: <InventorySection />,
    users: <UsersSection />,
    registers: <CashRegistersSection />,
    sales: <SalesSection />,
    reports: <ReportsSection />,
    settings: <SettingsSection />,
  };

  function changeSection(section: AdministrationSection) {
    if (visible(section)) setActiveSection(section);
  }

  return (
    <AdminShell
      activeSection={activeSection}
      onSectionChange={changeSection}
    >
      {visible(activeSection) ? sections[activeSection] : <section className="admin-card"><h1 className="text-xl font-black">Acceso restringido</h1><p className="mt-2 text-sm font-semibold text-slate-600">Tu cuenta no tiene permiso para consultar esta sección.</p></section>}
    </AdminShell>
  );
}
