import type { MemberRole } from "@/types";
import { Logo } from "./logo";
import { NavLinks } from "./nav-links";

/** Содержимое бокового меню — общее для десктопа и мобильного Sheet. */
export function SidebarContent({ role, onNavigate }: { role: MemberRole; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-2 pt-1">
        <Logo />
      </div>
      <NavLinks role={role} onNavigate={onNavigate} />
    </div>
  );
}

export function Sidebar({ role }: { role: MemberRole }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-sidebar lg:block">
      <SidebarContent role={role} />
    </aside>
  );
}
