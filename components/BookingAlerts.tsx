import Link from 'next/link';

export type BookingAlert = {
  id: string;
  guestName: string;
  checkIn: string;
  guestCount: number;
  withBreakfast: boolean;
};

export function BookingAlerts({ online, past }: { online: BookingAlert[]; past: BookingAlert[] }) {
  if (!online.length && !past.length) return null;
  return (
    <section className="card space-y-4 p-4">
      {online.length ? (
        <div>
          <h2 className="font-bold">New online bookings <span className="ml-1 rounded-full bg-amber-200 px-2 py-0.5 text-sm">{online.length}</span></h2>
          <ul className="mt-2 space-y-1 text-sm">
            {online.map((item) => (
              <li key={item.id}><Link className="font-semibold underline" href={`/reservations/${item.id}`}>{item.guestName}</Link> · {item.checkIn} · {item.guestCount} guest(s) · {item.withBreakfast ? 'Breakfast' : 'Room only'}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {past.length ? (
        <div>
          <h2 className="font-bold">Check-in date is already past</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {past.map((item) => (
              <li key={item.id}><Link className="font-semibold underline" href={`/reservations/${item.id}`}>{item.guestName}</Link> · {item.checkIn} · {item.guestCount} guest(s) · {item.withBreakfast ? 'Breakfast' : 'Room only'}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
