import { Check, Circle, HelpCircle } from "lucide-react";
import type { CallSummary, SummarySection } from "@/lib/transcripts";

function Bullets({ section }: { section: SummarySection }) {
  return (
    <ul className="mt-3 space-y-2.5">
      {(section.bullets ?? []).map((b, i) => (
        <li key={i}>
          <div className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
            <p className="text-[15px] leading-relaxed">{b.text}</p>
          </div>
          {b.children && b.children.length > 0 && (
            <ul className="ml-6 mt-2 space-y-2">
              {b.children.map((c, j) => (
                <li key={j} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/35" />
                  <p className="text-[15px] leading-relaxed text-muted-foreground">{c}</p>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function SectionBody({ section }: { section: SummarySection }) {
  switch (section.format) {
    case "table":
      return (
        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {(section.columns ?? []).map((c) => (
                  <th key={c} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(section.rows ?? []).map((r, i) => (
                <tr key={i} className="border-t border-border align-top">
                  {r.map((cell, j) => <td key={j} className="px-3 py-2 leading-relaxed">{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "key_value":
      return (
        <dl className="mt-3 divide-y divide-border rounded-lg border border-border">
          {(section.pairs ?? []).map((p, i) => (
            <div key={i} className="grid grid-cols-[minmax(120px,38%)_1fr] gap-3 px-3 py-2 text-sm">
              <dt className="text-muted-foreground">{p.key}</dt>
              <dd className="leading-relaxed">{p.value}</dd>
            </div>
          ))}
        </dl>
      );
    case "checklist":
      return (
        <ul className="mt-3 space-y-2">
          {(section.checklist ?? []).map((c, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[15px] leading-relaxed">
              {c.status === "done" ? <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
                : c.status === "open" ? <Circle className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                : <HelpCircle className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/60" />}
              <span>{c.item}</span>
            </li>
          ))}
        </ul>
      );
    case "paragraph":
      return <p className="mt-3 text-[15px] leading-relaxed">{section.paragraph}</p>;
    default:
      return <Bullets section={section} />;
  }
}

/** Overview → topic groups (each with their own layouts) → combined next steps. */
export default function SummaryView({ summary }: { summary: CallSummary }) {
  const groups: { category: string | null; sections: SummarySection[] }[] = [];
  for (const s of summary.sections) {
    const cat = s.category ?? null;
    const last = groups[groups.length - 1];
    if (last && last.category === cat) last.sections.push(s);
    else groups.push({ category: cat, sections: [s] });
  }
  const multi = groups.filter((g) => g.category).length > 1;

  return (
    <div className="space-y-9">
      {summary.overview && (
        <section>
          <h2 className="text-xl font-semibold tracking-tight">Call overview</h2>
          <p className="mt-3 text-[15px] leading-relaxed">{summary.overview}</p>
        </section>
      )}

      {groups.map((g, gi) => (
        <div key={gi} className="space-y-7">
          {g.category && multi && (
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{g.category}</p>
          )}
          {g.sections.map((s, i) => (
            <section key={`${s.heading}-${i}`}>
              <h2 className="text-xl font-semibold tracking-tight">{s.heading}</h2>
              <SectionBody section={s} />
            </section>
          ))}
        </div>
      ))}

      {summary.next_steps.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold tracking-tight">Next steps</h2>
          <ul className="mt-3 space-y-2.5">
            {summary.next_steps.map((n, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                <p className="text-[15px] leading-relaxed">{n}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
