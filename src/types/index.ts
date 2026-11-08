export type AppointmentStatus = "confirmed" | "pending" | "completed" | "cancelled" | "no_show";

export interface Service {
  id: string;
  name: string;
  category: string;
  description: string;
  duration: number; // минуты
  price: number; // ₽
  active: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  serviceIds: string[];
  schedule: string;
  rating: number;
  color: string; // tailwind-классы бейджа/блока
  colorKey: string; // ключ цвета в БД (violet, sky, …)
  active: boolean;
  userId: string | null; // логин специалиста (если есть)
  hours: { weekday: number; start: string; end: string; breakStart?: string; breakEnd?: string }[]; // weekday: 1 = понедельник
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  visits: number;
  totalSpent: number;
  lastVisit: string; // ISO yyyy-mm-dd
  createdAt: string;
  note?: string;
}

export interface Appointment {
  id: string;
  clientId: string;
  serviceId: string;
  staffId: string;
  date: string; // ISO yyyy-mm-dd
  time: string; // HH:MM
  status: AppointmentStatus;
  notes: string;
  source: "admin" | "online";
}

/** Запись с подставленными связанными сущностями. */
export interface AppointmentView extends Appointment {
  client: Client;
  service: Service;
  staff: StaffMember;
  endTime: string;
  price: number;
}

export type MemberRole = "owner" | "admin" | "staff";

export interface Company {
  name: string;
  slug: string; // адрес публичной записи: /book/<slug>
  phone: string;
  email: string;
  address: string;
  description: string;
  timezone: string;
  hours: { day: string; open: string; close: string }[];
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export interface DailyStat {
  date: string;
  bookings: number;
  revenue: number;
}
