export type Role = 'owner' | 'manager' | 'front_desk' | 'accounting';

export type Hotel = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  default_currency: string;
  default_downpayment_percent: number;
  house_rules: string;
  booking_terms: string;
  active: boolean;
};

export type Profile = {
  id: string;
  full_name: string | null;
  role: Role;
  hotel_id: string | null;
};

export type Room = {
  id: string;
  hotel_id: string;
  room_type_id: string | null;
  name: string;
  room_type_name: string | null;
  capacity: number;
  base_rate: number;
  sort_order: number;
  active: boolean;
};

export type Guest = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes?: string | null;
};

export type ReservationStatus =
  | 'tentative'
  | 'payment_submitted'
  | 'secured'
  | 'checked_in'
  | 'checked_out'
  | 'cancelled'
  | 'no_show';

export type PaymentStatus = 'submitted' | 'confirmed' | 'rejected';

export type PaymentMethod =
  | 'cash'
  | 'gcash'
  | 'bank_transfer'
  | 'card'
  | 'online_gateway'
  | 'booking_dot_com'
  | 'trip_dot_com'
  | 'other';

export type Reservation = {
  id: string;
  hotel_id: string;
  room_id: string;
  guest_id: string;
  status: ReservationStatus;
  booking_source: string;
  check_in: string;
  check_out: string;
  nights: number;
  guest_count: number;
  with_breakfast: boolean;
  posted_room_rate: number;
  surcharge_label: string | null;
  surcharge_amount: number;
  total_amount: number;
  downpayment_required: number;
  mode_of_payment: string | null;
  confirmed_by_name: string | null;
  notes: string | null;
  house_rules_sent_at: string | null;
  confirmation_sent_at: string | null;
  created_at: string;
  guests?: Guest | null;
  rooms?: Pick<Room, 'id' | 'name' | 'room_type_name'> | null;
  payments?: Payment[];
};

export type Payment = {
  id: string;
  reservation_id: string;
  amount: number;
  method: PaymentMethod;
  proof_path: string;
  proof_original_name: string | null;
  status: PaymentStatus;
  paid_at: string;
  confirmed_at: string | null;
  rejection_reason: string | null;
  reservations?: Reservation | null;
};
