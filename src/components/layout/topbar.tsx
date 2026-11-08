import { Plus, Search } from "lucide-react";
import { AppointmentFormDialog, type BookingContext } from "@/components/appointments/appointment-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MemberRole, NotificationItem } from "@/types";
import { MobileNav } from "./mobile-nav";
import { NotificationsMenu } from "./notifications-menu";
import { UserMenu, type MenuUser } from "./user-menu";

export function Topbar({
  user,
  role,
  notifications,
  booking,
}: {
  user: MenuUser;
  role: MemberRole;
  notifications: { items: NotificationItem[]; unread: number };
  booking: BookingContext;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur sm:gap-3 sm:px-6">
      <MobileNav role={role} />
      {/* Plain GET form: the clients page reads ?q= and filters the list. */}
      <form action="/clients" role="search" className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" placeholder="Поиск клиентов…" aria-label="Поиск клиентов" className="h-9 rounded-full bg-card pl-9" />
      </form>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <AppointmentFormDialog
          {...booking}
          trigger={
            <Button className="hidden rounded-full sm:inline-flex">
              <Plus /> Новая запись
            </Button>
          }
        />
        <NotificationsMenu {...notifications} />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
