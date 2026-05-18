export function PrintFooter({ printedAt = new Date(), staffName }: { printedAt?: string | Date; staffName?: string | null }) {
  const printedDate = typeof printedAt === 'string' ? new Date(printedAt) : printedAt;

  return (
    <footer className="mt-8 border-t border-slate-300 pt-3 text-xs text-slate-500">
      <div className="flex flex-col justify-between gap-1 sm:flex-row">
        <p>Printed {printedDate.toLocaleString()}{staffName ? ` by ${staffName}` : ''}</p>
        <p>This document is system-generated from the hotel operations app.</p>
      </div>
    </footer>
  );
}
