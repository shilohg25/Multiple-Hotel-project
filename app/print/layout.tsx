export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white px-4 py-6 text-slate-950 print:p-0">
      {children}
    </main>
  );
}
