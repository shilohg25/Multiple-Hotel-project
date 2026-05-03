export type Role = 'owner' | 'manager' | 'front_desk';

export type DownpaymentType = 'percent' | 'fixed' | 'first_night' | 'manual';

export type Hotel = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  booking_email: string | null;
  website_url: string | null;
  description: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  default_currency: string;
  downpayment_type: DownpaymentType;
  default_downpayment_percent: number;
  default_downpayment_amount: number;
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
  payer_name: string | null;
  payment_reference: string | null;
  payment_details: string;
  proof_path: string;
  proof_original_name: string | null;
  status: PaymentStatus;
  paid_at: string;
  confirmed_at: string | null;
  rejection_reason: string | null;
  reservations?: Reservation | null;
};

export type LedgerEntry = {
  id: string;
  hotel_id: string;
  reservation_id: string | null;
  entry_date: string;
  category: string;
  description: string | null;
  amount: number;
  payment_method: PaymentMethod;
  is_collectible: boolean;
  created_at: string;
};

export type CashCount = {
  id: string;
  hotel_id: string;
  count_date: string;
  denomination: number;
  quantity: number;
  created_at: string;
};
