import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen, ChevronDown, ChevronRight, Loader2, Lock, MessageSquarePlus, Play, Send, ShieldCheck, Trash2, X,
} from "lucide-react";
import { marked } from "marked";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  createPrompt, deletePrompt, fetchPrompts, previewCallType, validateCallTypeDraft,
  type CallTypeDraft, type CallTypeSection, type SummaryPrompt,
} from "@/lib/summaryPrompts";
import { fetchTranscripts, type CallSummary, type Transcript } from "@/lib/transcripts";
import SummaryView from "@/components/transcripts/SummaryView";

const formatLabel: Record<string, string> = {
  bullets: "List", table: "Table", key_value: "Key details", checklist: "Checklist", paragraph: "Paragraph",
};

const BUILDER_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/call-type-builder`;

function SectionsList({ sections }: { sections: CallTypeSection[] }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {sections.map((s) => (
        <li key={s.title} className="text-xs">
          <span className="font-medium text-foreground">{s.title}</span>
          <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{formatLabel[s.format] ?? s.format}</span>
          {(s.columns?.length || s.keys?.length) ? (
            <span className="ml-1.5 text-muted-foreground">{(s.columns?.length ? s.columns : s.keys)!.join(" · ")}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function TypeCard({ p, onDelete }: { p: SummaryPrompt; onDelete?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg border border-border bg-card">
      <div className="flex items-start gap-2 px-3 py-2.5">
        <button className="flex min-w-0 flex-1 items-start gap-2 text-left" onClick={() => setOpen((o) => !o)}>
          {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              {p.name}{p.is_system && <Lock className="h-3 w-3 text-muted-foreground" />}
            </p>
            {p.description && <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>}
          </div>
        </button>
        {onDelete && (
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onDelete} aria-label="Delete call type">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {open && (
        <div className="border-t border-border px-9 py-2.5 text-xs text-muted-foreground">
          {p.slug !== "sys-general" && p.detect_when && <p><span className="font-medium text-foreground">Applies when:</span> {p.detect_when}</p>}
          {p.distinct_from && <p className="mt-1">{p.distinct_from}</p>}
          {p.sections?.length > 0 && <SectionsList sections={p.sections} />}
          {p.notes && <p className="mt-2 italic">{p.notes}</p>}
        </div>
      )}
    </li>
  );
}

function extractDraft(text: string): { clean: string; draft: CallTypeDraft | null } {
  const m = text.match(/```calltype\s*([\s\S]*?)```/i);
  if (!m) {
    const open = text.search(/```calltype/i);
    return { clean: open >= 0 ? text.slice(0, open).trim() + "\n\n_Drafting…_" : text, draft: null };
  }
  try {
    const d = JSON.parse(m[1].trim()) as CallTypeDraft;
    d.sections = (d.sections ?? []).map((s) => ({
      ...s,
      columns: s.format === "table" ? s.columns ?? [] : [],
      keys: s.format === "key_value" || s.format === "checklist" ? s.keys ?? [] : [],
    }));
    return { clean: text.replace(m[0], "").trim(), draft: d };
  } catch {
    return { clean: text, draft: null };
  }
}

function Builder({ systemTypes, onSaved, onClose }: {
  systemTypes: SummaryPrompt[];
  onSaved: (p: SummaryPrompt) => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState<CallTypeDraft | null>(null);
  const [calls, setCalls] = useState<Transcript[]>([]);
  const [callId, setCallId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<CallSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTranscripts().then((rows) => {
      const ready = rows.filter((r) => r.status === "ready");
      setCalls(ready);
      if (ready[0]) setCallId(ready[0].id);
    }).catch(() => {});
  }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages, draft]);

  const problem = validateCallTypeDraft(draft);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    const history = [...messages, { role: "user" as const, content: text }];
    setMessages(history);
    setInput("");
    setStreaming(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(BUILDER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ messages: history }),
      });
      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error ?? "Request failed");
      }
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let full = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.error) throw new Error(payload.error);
          if (payload.content) {
            full += payload.content;
            setMessages([...history, { role: "assistant", content: extractDraft(full).clean }]);
          }
        }
      }
      const final = extractDraft(full);
      setMessages([...history, { role: "assistant", content: final.clean || "Here is the draft." }]);
      if (final.draft) { setDraft(final.draft); setPreview(null); }
    } catch (e) {
      toast.error((e as Error).message);
      setMessages(history);
    } finally {
      setStreaming(false);
    }
  };

  const runPreview = async () => {
    if (!draft || !callId) return;
    setPreviewing(true);
    setPreview(null);
    try {
      setPreview(await previewCallType(callId, draft, partnerId || undefined));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  };

  const save = async () => {
    if (!user || !draft || problem) return;
    if (systemTypes.some((s) => s.name.toLowerCase() === draft.name.trim().toLowerCase())) {
      toast.error("That name belongs to a standard call type — ask Landi for a different name.");
      return;
    }
    setSaving(true);
    try {
      onSaved(await createPrompt(user.id, draft));
      toast.success("Call type saved — Landi will check new calls against it");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-muted/20">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-sm font-medium">Build a call type with Landi</p>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      <div ref={scrollRef} className="max-h-[42vh] space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Describe the kind of call in your own words — e.g. “For retained exec searches I want the board's expectations,
            succession context, and anything confidential.” Landi asks follow-up questions, then drafts it.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed",
              m.role === "user" ? "bg-primary text-primary-foreground" : "bg-background text-foreground")}>
              {m.role === "assistant"
                ? <div className="prose prose-sm max-w-none dark:prose-invert [&_p]:my-1"
                    dangerouslySetInnerHTML={{ __html: marked.parse(m.content || "…") as string }} />
                : m.content}
            </div>
          </div>
        ))}
        {streaming && messages[messages.length - 1]?.role === "user" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

        {draft && (
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{draft.name}</p>
                {draft.description && <p className="text-xs text-muted-foreground">{draft.description}</p>}
              </div>
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
                problem ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
                <ShieldCheck className="h-3 w-3" />{problem ? "Needs changes" : "Rules check passed"}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">Applies when:</span> {draft.detect_when}</p>
            <SectionsList sections={draft.sections ?? []} />
            {problem && <p className="mt-2 text-xs text-destructive">{problem}</p>}

            <div className="mt-3 space-y-2 border-t border-border pt-3">
              <p className="text-xs font-medium">Preview on a call</p>
              {calls.length === 0 ? (
                <p className="text-xs text-muted-foreground">Upload or sync a call to preview this type on it.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <select value={callId} onChange={(e) => setCallId(e.target.value)}
                    className="h-8 max-w-[220px] rounded-md border border-border bg-background px-2 text-xs">
                    {calls.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                  <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}
                    className="h-8 max-w-[200px] rounded-md border border-border bg-background px-2 text-xs">
                    <option value="">Alone</option>
                    {systemTypes.filter((s) => s.slug !== "sys-general").map((s) =>
                      <option key={s.id} value={s.id}>Next to {s.name}</option>)}
                  </select>
                  <Button size="sm" variant="outline" className="h-8" disabled={!!problem || previewing} onClick={runPreview}>
                    {previewing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                    Preview
                  </Button>
                </div>
              )}
              {preview && (
                <div className="max-h-[40vh] overflow-y-auto rounded-md border border-border bg-background p-3 [&_h2]:text-base">
                  <SummaryView summary={preview} />
                </div>
              )}
            </div>
            <Button className="mt-3 w-full" disabled={!!problem || saving} onClick={save}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Confirm and save
            </Button>
          </div>
        )}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2 border-t border-border px-3 py-2">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          placeholder={draft ? "Ask for changes…" : "Describe the call type you want…"}
          className="h-9 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-primary/50" />
        <Button type="submit" size="icon" className="h-9 w-9 rounded-full" disabled={streaming || !input.trim()}>
          {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}

export default function PromptLibraryDialog() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"system" | "mine">("system");
  const [prompts, setPrompts] = useState<SummaryPrompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchPrompts().then(setPrompts).catch((e) => toast.error((e as Error).message)).finally(() => setLoading(false));
  }, [open]);

  const systemTypes = useMemo(() => prompts.filter((p) => p.is_system), [prompts]);
  const myTypes = useMemo(() => prompts.filter((p) => !p.is_system), [prompts]);
  const groups = useMemo(() => {
    const map = new Map<string, SummaryPrompt[]>();
    for (const p of systemTypes) map.set(p.category_group ?? "Other", [...(map.get(p.category_group ?? "Other") ?? []), p]);
    return Array.from(map.entries());
  }, [systemTypes]);

  const remove = async (p: SummaryPrompt) => {
    try {
      await deletePrompt(p.id);
      setPrompts((prev) => prev.filter((i) => i.id !== p.id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm"><BookOpen className="mr-1.5 h-4 w-4" />Call types</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Call types</DialogTitle>
          <DialogDescription>
            Landi checks every call against each type, keeps up to 3 clear matches and writes a section for each —
            always with a Call overview on top and Next steps at the bottom. No clear match gives a General note.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
          {(["system", "mine"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {t === "system" ? `Standard (${systemTypes.length})` : `My call types (${myTypes.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : tab === "system" ? (
          <div className="space-y-5">
            {systemTypes.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">Standard call types load the first time a call is summarised.</p>
            )}
            {groups.map(([g, list]) => (
              <div key={g}>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{g}</p>
                <ul className="space-y-1.5">{list.map((p) => <TypeCard key={p.id} p={p} />)}</ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {myTypes.length === 0 && !building && (
              <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                You have no call types of your own yet.
              </p>
            )}
            <ul className="space-y-1.5">{myTypes.map((p) => <TypeCard key={p.id} p={p} onDelete={() => remove(p)} />)}</ul>
            {building ? (
              <Builder
                systemTypes={systemTypes}
                onClose={() => setBuilding(false)}
                onSaved={(p) => { setPrompts((prev) => [...prev, p]); setBuilding(false); }}
              />
            ) : (
              <Button variant="outline" onClick={() => setBuilding(true)}>
                <MessageSquarePlus className="mr-1.5 h-4 w-4" />Build a call type with Landi
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
