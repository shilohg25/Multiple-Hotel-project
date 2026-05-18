import type { PaymentStatus, ReservationStatus } from '@/types/app';

const reservationMap: Record<ReservationStatus, string> = {
  tentative: 'border-amber-200 bg-amber-50 text-amber-700',
  payment_submitted: 'border-blue-200 bg-blue-50 text-blue-700',
  secured: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  checked_in: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  checked_out: 'border-slate-200 bg-slate-100 text-slate-700',
  cancelled: 'border-red-200 bg-red-50 text-red-700',
  no_show: 'border-red-200 bg-red-50 text-red-700'
};

const paymentMap: Record<PaymentStatus, string> = {
  submitted: 'border-blue-200 bg-blue-50 text-blue-700',
  confirmed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected: 'border-red-200 bg-red-50 text-red-700'
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
      className={`inline-flex items-center whitespace-nowrap rounded-md border px-2.5 py-1 text-[11px] font-semibold capitalize leading-none ${className}`}
    >
      {children}
    </span>
  );
}
