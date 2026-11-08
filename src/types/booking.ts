/** Shapes returned by the public_* database functions (see the public_booking migration). */
export interface PublicService {
  id: string;
  name: string;
  category: string;
  description: string;
  duration: number;
  price: number;
}

export interface PublicStaff {
  id: string;
  name: string;
  jobTitle: string;
  serviceIds: string[];
  weekdays: number[]; // 1 = Monday
}

export interface PublicOrg {
  name: string;
  description: string;
  address: string;
  phone: string;
  timezone: string;
  today: string; // yyyy-mm-dd in the organization's time zone
  services: PublicService[];
  staff: PublicStaff[];
}

export interface PublicSlot {
  time: string;
  staffId: string;
}

export interface PublicAppointment {
  status: string;
  date: string;
  time: string;
  endTime: string;
  service: string;
  price: number;
  staff: string;
  org: { name: string; address: string; phone: string; slug: string };
  clientName: string;
}
