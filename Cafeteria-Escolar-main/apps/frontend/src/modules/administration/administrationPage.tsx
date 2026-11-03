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

export function AdministrationPage() {
  const [activeSection, setActiveSection] = useState<AdministrationSection>(() =>
    window.location.hash.startsWith("#/admin/students") ? "students" : "dashboard",
  );

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

  return (
    <AdminShell
      activeSection={activeSection}
      onSectionChange={setActiveSection}
    >
      {sections[activeSection]}
    </AdminShell>
  );
}
