import Link from 'next/link';

export type BookingAlert = {
  id: string;
  guestName: string;
  checkIn: string;
  guestCount: number;
  withBreakfast: boolean;
};

const listCap = 20;

export function BookingAlerts({ online, past, viewAllHref = '/reservations' }: { online: BookingAlert[]; past: BookingAlert[]; viewAllHref?: string }) {
  if (!online.length && !past.length) return null;
  const shownOnline = online.slice(0, listCap);
  const shownPast = past.slice(0, listCap);
  return (
    <section className="card space-y-4 p-4">
      {online.length ? (
        <div>
          <h2 className="font-bold">New online bookings <span className="ml-1 rounded-full bg-amber-200 px-2 py-0.5 text-sm">{online.length}</span></h2>
          <ul className="mt-2 space-y-1 text-sm">
            {shownOnline.map((item) => (
              <li key={item.id}><Link className="font-semibold underline" href={`/reservations/${item.id}`}>{item.guestName}</Link> · {item.checkIn} · {item.guestCount} guest(s) · {item.withBreakfast ? 'Breakfast' : 'Room only'}</li>
            ))}
          </ul>
          {online.length > listCap ? <Link href={viewAllHref} className="mt-2 inline-block text-sm font-semibold underline">View all</Link> : null}
        </div>
      ) : null}
      {past.length ? (
        <div>
          <h2 className="font-bold">Check-in date is already past</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {shownPast.map((item) => (
              <li key={item.id}><Link className="font-semibold underline" href={`/reservations/${item.id}`}>{item.guestName}</Link> · {item.checkIn} · {item.guestCount} guest(s) · {item.withBreakfast ? 'Breakfast' : 'Room only'}</li>
            ))}
          </ul>
          {past.length > listCap ? <Link href={viewAllHref} className="mt-2 inline-block text-sm font-semibold underline">View all</Link> : null}
        </div>
      ) : null}
    </section>
  );
}
