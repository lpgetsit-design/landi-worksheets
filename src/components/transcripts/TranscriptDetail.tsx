import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RotateCw, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { downloadTranscript, type Transcript } from "@/lib/transcripts";
import { DEMO_SUMMARIES, type SummarySection } from "@/lib/transcriptDemo";

const tabs = ["summary", "transcript"] as const;
type Tab = (typeof tabs)[number];

export default function TranscriptDetail({ transcript }: { transcript: Transcript }) {
  const [tab, setTab] = useState<Tab>("summary");

  const summary: SummarySection[] = useMemo(() => {
    const preset = DEMO_SUMMARIES[transcript.id];
    if (preset) return preset;
    if (!transcript.segments.length) return [];
    return [{
      heading: "Conversation Highlights",
      bullets: transcript.segments.slice(0, 6).map((s) => ({ text: `${s.speaker}: ${s.text}` })),
    }];
  }, [transcript]);

  const dateLabel = new Date(transcript.occurred_at ?? transcript.created_at)
    .toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-6 pb-8 pt-6">
        <div className="mb-3">
          <span className="text-sm text-muted-foreground">{dateLabel}</span>
        </div>

        <h1 className="text-3xl font-semibold leading-tight tracking-tight">{transcript.title}</h1>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-full bg-muted p-1">
            {tabs.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors",
                  tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}>
                {t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="text-muted-foreground"
              onClick={() => toast.info("Regenerating the summary is coming soon")}>
              <RotateCw className="mr-1.5 h-4 w-4" />Regenerate
            </Button>
          </div>
        </div>

        {tab === "summary" && (
          <div className="mt-8 space-y-9">
            {summary.length === 0 ? (
              <p className="text-sm text-muted-foreground">No summary yet for this conversation.</p>
            ) : summary.map((section) => (
              <section key={section.heading}>
                <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
                <ul className="mt-4 space-y-3">
                  {section.bullets.map((b, i) => (
                    <li key={i}>
                      <div className="flex gap-3">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                        <p className="text-[15px] leading-relaxed">{b.text}</p>
                      </div>
                      {b.children && (
                        <ul className="ml-6 mt-3 space-y-3">
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
              </section>
            ))}
          </div>
        )}

        {tab === "transcript" && (
          <div className="mt-8 space-y-4">
            {transcript.segments.length === 0 ? (
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-muted-foreground">
                {transcript.content_text || "No transcript text available."}
              </p>
            ) : transcript.segments.map((s, i) => (
              <div key={i} className="grid grid-cols-[120px_1fr] gap-4">
                <p className="text-sm font-medium text-muted-foreground">{s.speaker}</p>
                <p className="text-[15px] leading-relaxed">{s.text}</p>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => downloadTranscript(transcript)}>
              <Download className="mr-1.5 h-4 w-4" />Download transcript
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
