import { CalendarDays, ClipboardList, LayoutDashboard, Scissors, Settings, UserCog, Users } from "lucide-react";

export const navItems = [
  { href: "/dashboard", label: "Дашборд", icon: LayoutDashboard },
  { href: "/calendar", label: "Календарь", icon: CalendarDays },
  { href: "/appointments", label: "Записи", icon: ClipboardList },
  { href: "/clients", label: "Клиенты", icon: Users },
  { href: "/services", label: "Услуги", icon: Scissors },
  { href: "/staff", label: "Сотрудники", icon: UserCog },
  { href: "/settings", label: "Настройки", icon: Settings, managerOnly: true },
];
