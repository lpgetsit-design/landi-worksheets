import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Mail, RotateCw, Copy, Loader2, ArrowLeft, Play, ArrowUpRight, Download,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { downloadTranscript, type Transcript } from "@/lib/transcripts";
import { DEMO_TRANSCRIPTS, DEMO_SUMMARIES, type SummarySection } from "@/lib/transcriptDemo";

const tabs = ["summary", "transcript", "usage"] as const;
type Tab = (typeof tabs)[number];

function normalize(row: any): Transcript {
  return {
    ...row,
    participants: Array.isArray(row.participants) ? row.participants : [],
    segments: Array.isArray(row.segments) ? row.segments : [],
  } as Transcript;
}

export default function TranscriptViewPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("summary");
  const [ask, setAsk] = useState("");
  const askRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const demo = DEMO_TRANSCRIPTS.find((t) => t.id === id);
      if (demo) {
        setTranscript(demo);
        setLoading(false);
        return;
      }
      const { data, error } = await (supabase as any)
        .from("transcripts").select("*").eq("id", id).maybeSingle();
      if (cancelled) return;
      if (error) toast.error(error.message);
      setTranscript(data ? normalize(data) : null);
      setLoading(false);
    };
    run();
    return () => { cancelled = true; };
  }, [id]);

  const summary: SummarySection[] = useMemo(() => {
    if (!transcript) return [];
    const preset = DEMO_SUMMARIES[transcript.id];
    if (preset) return preset;
    if (!transcript.segments.length) return [];
    return [{
      heading: "Conversation Highlights",
      bullets: transcript.segments.slice(0, 6).map((s) => ({ text: `${s.speaker}: ${s.text}` })),
    }];
  }, [transcript]);

  const plainSummary = useMemo(
    () => summary.map((s) => [s.heading, ...s.bullets.flatMap((b) => [`• ${b.text}`, ...(b.children ?? []).map((c) => `   – ${c}`)])].join("\n")).join("\n\n"),
    [summary],
  );

  const askAboutMeeting = () => {
    if (!ask.trim() || !transcript) return;
    navigate(`/chat?q=${encodeURIComponent(`About "${transcript.title}": ${ask.trim()}`)}`);
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!transcript) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">That transcript is not in your library.</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/transcripts")}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />Back to transcripts
        </Button>
      </main>
    );
  }

  const dateLabel = new Date(transcript.occurred_at ?? transcript.created_at)
    .toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  const words = (transcript.content_text ?? "").split(/\s+/).filter(Boolean).length;

  return (
    <main className="relative mx-auto w-full max-w-3xl px-6 pb-32 pt-8">
      <div className="mb-3 flex items-start justify-between gap-4">
        <button onClick={() => navigate("/transcripts")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />{dateLabel}
        </button>
        <Button variant="outline" size="sm" className="rounded-full"
          onClick={() => navigate(`/chat?q=${encodeURIComponent(`Draft a follow-up email from the meeting "${transcript.title}".`)}`)}>
          <Mail className="mr-1.5 h-4 w-4" />Follow-up email
        </Button>
      </div>

      <h1 className="truncate text-4xl font-semibold tracking-tight">{transcript.title}</h1>

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
          <Button variant="ghost" size="sm" className="text-muted-foreground"
            onClick={() => { navigator.clipboard.writeText(plainSummary); toast.success("Summary copied"); }}>
            <Copy className="mr-1.5 h-4 w-4" />Copy summary
          </Button>
        </div>
      </div>

      {tab === "summary" && (
        <div className="mt-8 space-y-9">
          {summary.length === 0 ? (
            <p className="text-sm text-muted-foreground">No summary yet for this conversation.</p>
          ) : summary.map((section) => (
            <section key={section.heading}>
              <h2 className="text-2xl font-semibold tracking-tight">{section.heading}</h2>
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
            <div key={i} className="grid grid-cols-[140px_1fr] gap-4">
              <p className="text-sm font-medium text-muted-foreground">{s.speaker}</p>
              <p className="text-[15px] leading-relaxed">{s.text}</p>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => downloadTranscript(transcript)}>
            <Download className="mr-1.5 h-4 w-4" />Download transcript
          </Button>
        </div>
      )}

      {tab === "usage" && (
        <dl className="mt-8 grid gap-3 sm:grid-cols-2">
          {[
            ["Source", transcript.source === "teams" ? "Teams meeting" : transcript.source === "ringcentral" ? "Phone call" : "Uploaded file"],
            ["Duration", transcript.duration_seconds ? `${Math.round(transcript.duration_seconds / 60)} min` : "—"],
            ["Participants", transcript.participants.length ? transcript.participants.join(", ") : "—"],
            ["Speaker turns", String(transcript.segments.length)],
            ["Words transcribed", words.toLocaleString()],
            ["Status", transcript.status],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-border bg-card px-4 py-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
              <dd className="mt-1 text-sm font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-6">
        <div className="pointer-events-auto flex w-full max-w-3xl items-center gap-3">
          <Button variant="outline" className="h-12 shrink-0 rounded-full px-5 shadow-sm"
            onClick={() => navigate(`/chat?q=${encodeURIComponent(`Continue working from the meeting "${transcript.title}".`)}`)}>
            <Play className="mr-2 h-4 w-4" />Resume Session
          </Button>
          <div className="flex h-12 flex-1 items-center gap-2 rounded-full border border-border bg-card pl-5 pr-1.5 shadow-sm">
            <input ref={askRef} value={ask} onChange={(e) => setAsk(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && askAboutMeeting()}
              placeholder="Ask about this meeting..."
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            <Button size="icon" className="h-9 w-9 rounded-full" onClick={askAboutMeeting} aria-label="Ask">
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
