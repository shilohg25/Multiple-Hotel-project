import { requireStaff } from '@/lib/auth';
import { helpFaqs, helpGuides } from '@/lib/help-content';

export default async function HelpPage() {
  await requireStaff();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight">How to</h1>
        <p className="mt-1 max-w-2xl text-slate-600">Short steps for a new shift. The app calculates the totals. You count the cash, name the guest, and ask a manager when a price or a day needs approval.</p>
      </div>
      {helpGuides.map((guide) => (
        <section key={guide.id} className="card p-5">
          <h2 className="text-xl font-bold">{guide.title}</h2>
          <p className="mt-1 text-slate-600">{guide.summary}</p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-800">
            {guide.steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </section>
      ))}
      <section className="space-y-3">
        <h2 className="text-xl font-bold">Questions</h2>
        {helpFaqs.map((item) => (
          <article key={item.question} className="card p-4">
            <h3 className="font-bold">{item.question}</h3>
            <p className="mt-1 text-slate-700">{item.answer}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
