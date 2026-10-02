import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Sparkles, AlertTriangle, RotateCcw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  currentSummary, downloadTranscript, saveEditedSummary, undoSummary,
  type CallSummary, type Transcript,
} from "@/lib/transcripts";
import { fetchPrompts, summarizeTranscript, type SummaryPrompt } from "@/lib/summaryPrompts";
import { DEMO_FRAMED, DEMO_PROMPT_NAMES, DEMO_SUMMARIES } from "@/lib/transcriptDemo";
import TranscriptChatOverlay from "@/components/transcripts/TranscriptChatOverlay";
import SummaryView from "@/components/transcripts/SummaryView";

const tabs = ["summary", "transcript"] as const;
type Tab = (typeof tabs)[number];

const isDemo = (t: Transcript) => t.id.startsWith("demo-");

export default function TranscriptDetail({
  transcript,
  onChange,
}: {
  transcript: Transcript;
  /** Called with the updated transcript after an edit, undo or regenerate. */
  onChange?: (t: Transcript) => void;
}) {
  const [tab, setTab] = useState<Tab>("summary");
  const [demoSummary, setDemoSummary] = useState<CallSummary | null>(null);
  const [demoHistory, setDemoHistory] = useState<CallSummary[]>([]);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [undoing, setUndoing] = useState(false);

  useEffect(() => { setDemoSummary(null); setDemoHistory([]); }, [transcript.id]);

  const demo = isDemo(transcript);

  const summary: CallSummary = useMemo(() => {
    if (demo) {
      if (demoSummary) return demoSummary;
      const framed = DEMO_FRAMED[transcript.id];
      if (framed) return { overview: framed.overview, sections: framed.sections, next_steps: framed.next_steps };
      return { overview: null, sections: DEMO_SUMMARIES[transcript.id] ?? [], next_steps: [] };
    }
    return currentSummary(transcript);
  }, [transcript, demo, demoSummary]);

  const topics: string[] = demo
    ? (DEMO_PROMPT_NAMES[transcript.id] ?? "").split(" + ").filter(Boolean)
    : (transcript.summary_categories ?? []).map((c) => c.name);

  const status = demo ? "ready" : transcript.summary_status ?? "pending";
  const canUndo = demo ? demoHistory.length > 0 : (transcript.summary_history?.length ?? 0) > 0;
  const hasContent = !!summary.overview || summary.sections.length > 0;

  const dateLabel = new Date(transcript.occurred_at ?? transcript.created_at)
    .toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

  const applyEdit = async (next: CallSummary) => {
    if (demo) {
      setDemoHistory((h) => [summary, ...h]);
      setDemoSummary(next);
      return;
    }
    try {
      onChange?.(await saveEditedSummary(transcript, next));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const undo = async () => {
    if (demo) {
      const [last, ...rest] = demoHistory;
      if (last) { setDemoSummary(last); setDemoHistory(rest); }
      return;
    }
    setUndoing(true);
    try {
      onChange?.(await undoSummary(transcript));
      toast.success("Previous summary restored");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUndoing(false);
    }
  };

  const regenerate = async (ids: string[] | undefined) => {
    setRegenOpen(false);
    if (demo) { toast("Sample transcripts can't be regenerated — connect sync or upload a call."); return; }
    setRegenerating(true);
    onChange?.({ ...transcript, summary_status: "running" });
    try {
      await summarizeTranscript(transcript.id, ids);
      toast.success("New summary ready — the previous one is kept, use Undo to go back");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRegenerating(false);
      onChange?.({ ...transcript, summary_status: "pending" }); // parent refetches
    }
  };

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-6 pb-[calc(25%+3rem)] pt-6">
        <div className="mb-3">
          <span className="text-sm text-muted-foreground">{dateLabel}</span>
        </div>

        <h1 className="pr-8 text-3xl font-semibold leading-tight tracking-tight">{transcript.title}</h1>

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
          {tab === "summary" && (
            <div className="flex items-center gap-1">
              {canUndo && (
                <Button variant="ghost" size="sm" onClick={undo} disabled={undoing}>
                  {undoing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Undo2 className="mr-1.5 h-4 w-4" />}
                  Undo
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setRegenOpen(true)}
                disabled={regenerating || status === "running"}>
                <RotateCcw className={cn("mr-1.5 h-4 w-4", regenerating && "animate-spin")} />
                Regenerate
              </Button>
            </div>
          )}
        </div>

        {topics.length > 0 && tab === "summary" && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            {topics.map((name) => (
              <span key={name}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3" />{name}
              </span>
            ))}
          </div>
        )}

        {tab === "summary" && (
          <div className="mt-8">
            {status === "running" || (status === "pending" && !hasContent) ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Spotting the topics and writing the summary — the Transcript tab is ready now.
              </p>
            ) : status === "failed" && !hasContent ? (
              <p className="flex items-start gap-2 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {transcript.summary_error ?? "The summary could not be generated."}
              </p>
            ) : !hasContent ? (
              <p className="text-sm text-muted-foreground">No summary yet for this conversation.</p>
            ) : (
              <SummaryView summary={summary} />
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

      <TranscriptChatOverlay transcript={transcript} summary={summary} topics={topics} onSummaryUpdate={applyEdit} />

      <RegenerateDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        current={(transcript.summary_categories ?? []).map((c) => c.id)}
        onRun={regenerate}
      />
    </div>
  );
}

function RegenerateDialog({
  open, onOpenChange, current, onRun,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  current: string[];
  onRun: (ids: string[] | undefined) => void;
}) {
  const [types, setTypes] = useState<SummaryPrompt[]>([]);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setPicked(current);
    fetchPrompts().then(setTypes).catch((e) => toast.error((e as Error).message));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const map = new Map<string, SummaryPrompt[]>();
    for (const t of types) {
      const g = t.is_system ? t.category_group ?? "Other" : "My call types";
      map.set(g, [...(map.get(g) ?? []), t]);
    }
    return Array.from(map.entries());
  }, [types]);

  const toggle = (id: string, isGeneral: boolean) => {
    setPicked((p) => {
      if (p.includes(id)) return p.filter((x) => x !== id);
      if (isGeneral) return [id];
      const withoutGeneral = p.filter((x) => !types.find((t) => t.id === x && t.slug === "sys-general"));
      return withoutGeneral.length >= 3 ? withoutGeneral : [...withoutGeneral, id];
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Regenerate summary</DialogTitle>
          <DialogDescription>
            Let Landi spot the topics again, or pick up to 3 call types yourself. The current summary is kept — Undo brings it back.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {groups.map(([g, list]) => (
            <div key={g}>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">{g}</p>
              <div className="grid gap-1 sm:grid-cols-2">
                {list.map((t) => {
                  const on = picked.includes(t.id);
                  const full = !on && picked.length >= 3;
                  return (
                    <label key={t.id}
                      className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60",
                        full && "opacity-50")}>
                      <Checkbox checked={on} disabled={full} onCheckedChange={() => toggle(t.id, t.slug === "sys-general")} />
                      {t.name}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => onRun(undefined)}>
            <Sparkles className="mr-1.5 h-4 w-4" />Let Landi pick
          </Button>
          <Button disabled={picked.length === 0} onClick={() => onRun(picked)}>
            Use {picked.length || ""} selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
