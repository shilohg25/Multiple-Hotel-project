type PrintHeaderProps = {
  hotelName: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  reportTitle: string;
  printedAt?: string | Date;
};

export function PrintHeader({ hotelName, address, phone, email, reportTitle, printedAt = new Date() }: PrintHeaderProps) {
  const printedDate = typeof printedAt === 'string' ? new Date(printedAt) : printedAt;

  return (
    <header className="mb-6 border-b border-slate-300 pb-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-black tracking-tight">{hotelName}</h1>
          {address ? <p className="mt-1 text-sm text-slate-600">{address}</p> : null}
          <p className="mt-1 text-sm text-slate-600">
            {[phone, email].filter(Boolean).join(' | ') || 'Hotel contact details not set'}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xl font-bold">{reportTitle}</p>
          <p className="mt-1 text-xs text-slate-500">Printed {printedDate.toLocaleString()}</p>
        </div>
      </div>
    </header>
  );
}
