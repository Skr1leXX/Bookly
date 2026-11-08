"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { MemberRole } from "@/types";
import { SidebarContent } from "./sidebar";

export function MobileNav({ role }: { role: MemberRole }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Открыть меню" />}>
        <Menu />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0" showCloseButton={false}>
        <SheetTitle className="sr-only">Навигация</SheetTitle>
        <SidebarContent role={role} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
