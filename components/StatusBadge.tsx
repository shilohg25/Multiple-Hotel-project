import type { PaymentStatus, ReservationStatus } from '@/types/app';

const reservationMap: Record<ReservationStatus, string> = {
  tentative: 'bg-amber-50 text-amber-700 border border-amber-200',
  payment_submitted: 'bg-blue-50 text-blue-700 border border-blue-200',
  secured: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  checked_in: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  checked_out: 'bg-slate-100 text-slate-700 border border-slate-200',
  cancelled: 'bg-red-50 text-red-700 border border-red-200',
  no_show: 'bg-red-50 text-red-700 border border-red-200'
};

const paymentMap: Record<PaymentStatus, string> = {
  submitted: 'bg-blue-50 text-blue-700 border border-blue-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border border-red-200'
};

export function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  return <Badge className={reservationMap[status]}>{status.replaceAll('_', ' ')}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge className={paymentMap[status]}>{status}</Badge>;
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold capitalize whitespace-nowrap ${className}`}
    >
      {children}
    </span>
  );
}
