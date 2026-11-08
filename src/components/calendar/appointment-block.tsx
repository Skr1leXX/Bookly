import { cn } from "@/lib/utils";
import { toMinutes } from "@/lib/dates";
import type { AppointmentView } from "@/types";

/** Раскладывает пересекающиеся записи по дорожкам (shortcut: ширина делится поровну на максимум дорожек колонки). */
function assignLanes(items: AppointmentView[]) {
  const laneEnds: number[] = [];
  const placed = [...items]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((a) => {
      const start = toMinutes(a.time);
      let lane = laneEnds.findIndex((end) => end <= start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = toMinutes(a.endTime);
      return { a, lane };
    });
  return { placed, lanes: Math.max(laneEnds.length, 1) };
}

interface ColumnProps {
  items: AppointmentView[];
  startHour: number;
  hourPx: number;
  draggable: (a: AppointmentView) => boolean;
  draggingId: string | null;
  onOpen: (a: AppointmentView) => void;
  onDragStart: (a: AppointmentView, grabMinutes: number) => void;
  onDragEnd: () => void;
}

/** Записи одной колонки календаря (день или специалист), позиционированные по времени. */
export function AppointmentBlocks({ items, startHour, hourPx, draggable, draggingId, onOpen, onDragStart, onDragEnd }: ColumnProps) {
  const { placed, lanes } = assignLanes(items.filter((a) => a.status !== "cancelled"));
  return (
    <>
      {placed.map(({ a, lane }) => {
        const top = ((toMinutes(a.time) - startHour * 60) / 60) * hourPx;
        const height = (a.service.duration / 60) * hourPx;
        const canDrag = draggable(a);
        return (
          <button
            key={a.id}
            type="button"
            draggable={canDrag}
            onClick={(e) => {
              e.stopPropagation();
              onOpen(a);
            }}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", a.id);
              onDragStart(a, Math.round(((e.clientY - e.currentTarget.getBoundingClientRect().top) / hourPx) * 60));
            }}
            onDragEnd={onDragEnd}
            title={`${a.time}–${a.endTime} · ${a.client.name} · ${a.service.name}`}
            className={cn(
              "absolute overflow-hidden rounded-lg border-l-4 px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition-opacity hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring",
              canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
              a.staff.color,
              a.status === "pending" && "border-dashed opacity-75",
              a.status === "no_show" && "opacity-50",
              draggingId === a.id && "opacity-30",
            )}
            style={{ top, height: height - 2, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
          >
            <p className={cn("truncate font-semibold", a.status === "no_show" && "line-through")}>{a.client.name}</p>
            <p className="truncate opacity-80">{a.service.name}</p>
            {height > 56 && <p className="truncate opacity-70">{a.time}–{a.endTime}</p>}
          </button>
        );
      })}
    </>
  );
}
