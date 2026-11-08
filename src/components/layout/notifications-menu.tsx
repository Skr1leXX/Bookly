import { Bell } from "lucide-react";
import { markAllNotificationsRead } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { NotificationItem } from "@/types";

export function NotificationsMenu({ items, unread }: { items: NotificationItem[]; unread: number }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="relative" aria-label={`Уведомления: ${unread} новых`} />}>
        <Bell />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground ring-2 ring-background">
            {unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
        <DropdownMenuLabel className="flex items-center justify-between">
          Уведомления
          {unread > 0 && (
            <form action={markAllNotificationsRead}>
              <button type="submit" className="text-xs font-medium text-primary hover:underline">
                Прочитать все
              </button>
            </form>
          )}
        </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {items.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Пока ничего нет</p>}
        <ul className="max-h-80 overflow-y-auto">
          {items.map((n) => (
            <li key={n.id} className={cn("px-3 py-2 text-sm", !n.isRead && "bg-accent/50")}>
              <p className="font-medium">{n.title}</p>
              {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
            </li>
          ))}
        </ul>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
