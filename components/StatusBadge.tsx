import type { PaymentStatus, ReservationStatus } from '@/types/app';

const reservationMap: Record<ReservationStatus, string> = {
  tentative: 'bg-amber-50 text-amber-700 ring-amber-200',
  payment_submitted: 'bg-blue-50 text-blue-700 ring-blue-200',
  secured: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  checked_in: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  checked_out: 'bg-slate-100 text-slate-700 ring-slate-200',
  cancelled: 'bg-red-50 text-red-700 ring-red-200',
  no_show: 'bg-red-50 text-red-700 ring-red-200'
};

const paymentMap: Record<PaymentStatus, string> = {
  submitted: 'bg-blue-50 text-blue-700 ring-blue-200',
  confirmed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-red-50 text-red-700 ring-red-200'
};

export function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  return <Badge className={reservationMap[status]}>{status.replaceAll('_', ' ')}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge className={paymentMap[status]}>{status}</Badge>;
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${className}`}>{children}</span>;
}
