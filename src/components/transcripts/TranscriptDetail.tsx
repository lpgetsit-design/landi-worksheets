import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { downloadTranscript, type SummarySection, type Transcript } from "@/lib/transcripts";
import { DEMO_SUMMARIES } from "@/lib/transcriptDemo";
import TranscriptChatOverlay from "@/components/transcripts/TranscriptChatOverlay";

const tabs = ["summary", "transcript"] as const;
type Tab = (typeof tabs)[number];

export default function TranscriptDetail({
  transcript,
  promptName,
  onSummaryUpdate,
}: {
  transcript: Transcript;
  promptName?: string | null;
  onSummaryUpdate?: (sections: SummarySection[]) => void | Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("summary");
  const [localSummary, setLocalSummary] = useState<SummarySection[] | null>(null);

  useEffect(() => { setLocalSummary(null); }, [transcript.id]);

  const summary: SummarySection[] = useMemo(() => {
    if (localSummary) return localSummary;
    const preset = DEMO_SUMMARIES[transcript.id];
    if (preset) return preset;
    return transcript.summary_sections ?? [];
  }, [transcript, localSummary]);

  const status = localSummary || DEMO_SUMMARIES[transcript.id]
    ? "ready"
    : transcript.summary_status ?? "pending";

  const dateLabel = new Date(transcript.occurred_at ?? transcript.created_at)
    .toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-6 pb-32 pt-6">
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
          {promptName && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              {promptName}
            </span>
          )}
        </div>

        {tab === "summary" && (
          <div className="mt-8 space-y-9">
            {status === "running" || (status === "pending" && summary.length === 0) ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Summarising this conversation — the Transcript tab is ready now.
              </p>
            ) : status === "failed" ? (
              <p className="flex items-start gap-2 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {transcript.summary_error ?? "The summary could not be generated."}
              </p>
            ) : summary.length === 0 ? (
              <p className="text-sm text-muted-foreground">No summary yet for this conversation.</p>
            ) : (
              summary.map((section) => (
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
              ))
            )}
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

      <TranscriptChatOverlay
        transcript={transcript}
        summary={summary}
        onSummaryUpdate={async (sections) => {
          setLocalSummary(sections);
          await onSummaryUpdate?.(sections);
        }}
      />
    </div>
  );
}
