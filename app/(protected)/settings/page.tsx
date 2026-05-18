import Link from 'next/link';
import { requireStaff } from '@/lib/auth';

const ownerCards = [
  {
    href: '/settings/pricing',
    title: 'Room Pricing',
    description: 'Update room rates, capacity, room type labels, and active status.'
  },
  {
    href: '/settings/services',
    title: 'Services & Charges',
    description: 'Manage hotel-specific service items and default charge prices.'
  },
  {
    href: '/settings/price-history',
    title: 'Price Change History',
    description: 'Review room and service price changes by hotel.'
  }
];

export default async function SettingsPage() {
  const staff = await requireStaff();
  const cards = staff.profile.role === 'owner'
    ? ownerCards
    : ownerCards.filter((card) => card.href === '/settings/price-history');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Settings</h1>
        <p className="mt-1 text-slate-500">Owner controls for pricing and hotel service catalogs.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="card block p-5 hover:bg-slate-50">
            <h2 className="text-lg font-bold">{card.title}</h2>
            <p className="mt-2 text-sm text-slate-500">{card.description}</p>
          </Link>
        ))}
      </div>
      {!cards.length ? (
        <div className="card p-6 text-sm text-slate-500">No settings pages are available for your role.</div>
      ) : null}
    </div>
  );
}
