import { useEffect, useMemo, useState } from "react";
import { Loader2, Lock, Plus, Trash2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { createPrompt, deletePrompt, fetchPrompts, type SummaryPrompt } from "@/lib/summaryPrompts";

const emptyDraft = { name: "", description: "", match_hints: "", body: "" };

export default function PromptLibraryDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"system" | "mine">("system");
  const [prompts, setPrompts] = useState<SummaryPrompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchPrompts()
      .then(setPrompts)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, [open]);

  const systemPrompts = useMemo(() => prompts.filter((p) => p.is_system), [prompts]);
  const myPrompts = useMemo(() => prompts.filter((p) => !p.is_system), [prompts]);

  const save = async () => {
    if (!user) return;
    if (!draft.name.trim() || !draft.body.trim()) {
      toast.error("A name and prompt instructions are required");
      return;
    }
    if (systemPrompts.some((p) => p.name.toLowerCase() === draft.name.trim().toLowerCase())) {
      toast.error("That name belongs to a Landi prompt — choose a new name for your version.");
      return;
    }
    setSaving(true);
    try {
      const created = await createPrompt(user.id, {
        name: draft.name.trim(),
        description: draft.description.trim(),
        match_hints: draft.match_hints.trim(),
        body: draft.body.trim(),
      });
      setPrompts((prev) => [...prev, created]);
      setDraft(emptyDraft);
      setCreating(false);
      setTab("mine");
      toast.success("Prompt added — it will be used when the classifier matches it");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: SummaryPrompt) => {
    try {
      await deletePrompt(p.id);
      setPrompts((prev) => prev.filter((i) => i.id !== p.id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const list = tab === "system" ? systemPrompts : myPrompts;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm"><BookOpen className="mr-1.5 h-4 w-4" />Prompts</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Prompt library</DialogTitle>
          <DialogDescription>
            Every transcript is classified automatically and summarised with one of these prompts.
            Landi's prompts are read-only; your own prompts stay private to you.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
          {(["system", "mine"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}>
              {t === "system" ? `System prompts (${systemPrompts.length})` : `My prompts (${myPrompts.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <ul className="space-y-2">
            {list.length === 0 && (
              <li className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                You have no prompts of your own yet.
              </li>
            )}
            {list.map((p) => (
              <li key={p.id} className="rounded-lg border border-border bg-card px-3.5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      {p.name}
                      {p.is_system && <Lock className="h-3 w-3 text-muted-foreground" />}
                    </p>
                    {p.description && <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>}
                    {p.match_hints && (
                      <p className="mt-1 text-xs text-muted-foreground/80">Matches on: {p.match_hints}</p>
                    )}
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{p.body}</p>
                  </div>
                  {!p.is_system && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                      onClick={() => remove(p)} aria-label="Delete prompt">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {creating ? (
          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">New name</Label>
              <Input id="p-name" value={draft.name} placeholder="e.g. My intake brief"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <p className="text-xs text-muted-foreground">Names are unique across Landi — you cannot reuse a system prompt name.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-desc">What it is for</Label>
              <Input id="p-desc" value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-hints">Clues the classifier should look for</Label>
              <Input id="p-hints" value={draft.match_hints} placeholder="intake, kickoff, hiring manager"
                onChange={(e) => setDraft({ ...draft, match_hints: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-body">Summary instructions</Label>
              <Textarea id="p-body" rows={5} value={draft.body}
                placeholder="Summarise this conversation with sections …"
                onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save prompt
              </Button>
              <Button variant="ghost" onClick={() => { setCreating(false); setDraft(emptyDraft); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={() => { setCreating(true); setTab("mine"); }}>
            <Plus className="mr-1.5 h-4 w-4" />Create my prompt
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
