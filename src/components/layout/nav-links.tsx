"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { MemberRole } from "@/types";
import { navItems } from "./nav-items";

export function NavLinks({ role, onNavigate }: { role: MemberRole; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {navItems
        .filter((i) => !i.managerOnly || role !== "staff")
        .map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-accent-foreground",
                active && "bg-accent text-accent-foreground shadow-sm",
              )}
            >
              <Icon className={cn("size-[18px]", active && "text-primary")} />
              {label}
            </Link>
          );
        })}
    </nav>
  );
}
