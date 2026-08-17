import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Upload, RefreshCw, Loader2, Trash2, Download, FileAudio, Video, FileText, Plug, AlertTriangle,
  Search, Users, Clock, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import TranscriptDetail from "@/components/transcripts/TranscriptDetail";
import {
  fetchTranscripts, uploadTranscriptFile, deleteTranscript, downloadTranscript,
  syncTeams, syncRingCentral, fetchIntegrations, saveIntegration,
  type Transcript, type IntegrationLink,
} from "@/lib/transcripts";
import { DEMO_TRANSCRIPTS } from "@/lib/transcriptDemo";

const sourceMeta: Record<Transcript["source"], { label: string; Icon: typeof FileText }> = {
  upload: { label: "Uploaded", Icon: FileText },
  teams: { label: "Teams meeting", Icon: Video },
  ringcentral: { label: "Phone call", Icon: FileAudio },
};

const filters = [
  { key: "all", label: "All" },
  { key: "teams", label: "Teams" },
  { key: "ringcentral", label: "Calls" },
  { key: "upload", label: "Uploads" },
] as const;

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

const isDemo = (t: Transcript) => t.id.startsWith("demo-");

export default function TranscriptsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Transcript[]>([]);
  const [demoItems, setDemoItems] = useState<Transcript[]>(DEMO_TRANSCRIPTS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]["key"]>("all");
  const [selected, setSelected] = useState<Transcript | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationLink[]>([]);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [msValue, setMsValue] = useState("");
  const [rcValue, setRcValue] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const autoRan = useRef(false);

  const load = useCallback(async () => {
    try {
      const [rows, links] = await Promise.all([fetchTranscripts(), fetchIntegrations()]);
      setItems(rows);
      setIntegrations(links);
      setMsValue(links.find((l) => l.provider === "microsoft")?.external_email ?? "");
      setRcValue(links.find((l) => l.provider === "ringcentral")?.external_user_id ?? "");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-sync in the background on open, then every 5 minutes. Failures stay quiet.
  const autoSync = useCallback(async () => {
    setAutoSyncing(true);
    const links = await fetchIntegrations().catch(() => [] as IntegrationLink[]);
    const jobs: Promise<unknown>[] = [];
    if (links.some((l) => l.provider === "microsoft")) jobs.push(syncTeams());
    if (links.some((l) => l.provider === "ringcentral")) jobs.push(syncRingCentral());
    await Promise.allSettled(jobs);
    setLastSynced(new Date());
    setAutoSyncing(false);
    load();
  }, [load]);

  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    autoSync();
    const id = setInterval(autoSync, 5 * 60_000);
    return () => clearInterval(id);
  }, [autoSync]);

  const showDemo = !loading && items.length === 0;
  const allItems = showDemo ? demoItems : items;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allItems.filter((t) => {
      if (filter !== "all" && t.source !== filter) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.content_text ?? "").toLowerCase().includes(q) ||
        t.participants.some((p) => p.toLowerCase().includes(q))
      );
    });
  }, [allItems, filter, query]);

  const processingCount = useMemo(() => allItems.filter((i) => i.status === "processing").length, [allItems]);

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length || !user) return;
    setBusy("upload");
    try {
      for (const file of Array.from(files)) await uploadTranscriptFile(user.id, file);
      toast.success("Transcript added to your library");
      await load();
    } catch (e) {
      toast.error(`Upload failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (t: Transcript) => {
    if (isDemo(t)) {
      setDemoItems((prev) => prev.filter((i) => i.id !== t.id));
      if (selected?.id === t.id) setSelected(null);
      return;
    }
    setBusy(t.id);
    try {
      await deleteTranscript(t);
      setItems((prev) => prev.filter((i) => i.id !== t.id));
      if (selected?.id === t.id) setSelected(null);
      toast.success("Transcript deleted");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = (t: Transcript) => {
    if (isDemo(t)) {
      const blob = new Blob([t.content_text ?? ""], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${t.title}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    downloadTranscript(t);
  };

  const saveLinks = async () => {
    if (!user) return;
    setBusy("links");
    try {
      if (msValue.trim()) await saveIntegration(user.id, "microsoft", msValue.trim());
      if (rcValue.trim()) await saveIntegration(user.id, "ringcentral", rcValue.trim());
      toast.success("Connections saved");
      setConnectionsOpen(false);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const msLinked = integrations.some((l) => l.provider === "microsoft");
  const rcLinked = integrations.some((l) => l.provider === "ringcentral");

  return (
    <main className="w-full px-4 py-8">
      <div className={cn("flex w-full flex-col gap-6 lg:flex-row", selected ? "mx-auto max-w-[1600px]" : "mx-auto max-w-5xl")}>
        <section className={cn("min-w-0", selected ? "lg:w-[42%] lg:shrink-0" : "w-full")}>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transcripts</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            {autoSyncing ? (
              <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Syncing Teams and RingCentral…</>
            ) : (
              <>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                Auto-sync on · {lastSynced ? `last checked ${lastSynced.toLocaleTimeString(undefined, { timeStyle: "short" })}` : "waiting"}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" multiple accept=".txt,.vtt,.srt,text/*" className="hidden"
            onChange={(e) => handleUpload(e.target.files)} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy === "upload"}>
            {busy === "upload" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
            Upload
          </Button>
          <Button variant="outline" size="sm" onClick={autoSync} disabled={autoSyncing}>
            <RefreshCw className={cn("mr-1.5 h-4 w-4", autoSyncing && "animate-spin")} />
            Sync now
          </Button>
          <Dialog open={connectionsOpen} onOpenChange={setConnectionsOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm"><Plug className="mr-1.5 h-4 w-4" />Connections</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Link your accounts</DialogTitle>
                <DialogDescription>
                  Sync uses company system access, so we need to know which Microsoft and RingCentral
                  identities are yours. Only your own meetings and recorded calls are imported.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ms">Microsoft work email {msLinked && <span className="text-xs text-muted-foreground">(linked)</span>}</Label>
                  <Input id="ms" value={msValue} onChange={(e) => setMsValue(e.target.value)} placeholder="you@company.com" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rc">RingCentral extension ID {rcLinked && <span className="text-xs text-muted-foreground">(linked)</span>}</Label>
                  <Input id="rc" value={rcValue} onChange={(e) => setRcValue(e.target.value)} placeholder="1234567890" />
                  <p className="text-xs text-muted-foreground">Call recording must be switched on for phone transcripts.</p>
                </div>
                <Button onClick={saveLinks} disabled={busy === "links"} className="w-full">
                  {busy === "links" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles, people, what was said"
            className="pl-9" />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
          {filters.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                filter === f.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {showDemo && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          Sample transcripts shown for layout — your real Teams meetings and recorded calls replace these once sync is connected.
        </div>
      )}

      {processingCount > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {processingCount} recording{processingCount > 1 ? "s are" : " is"} still being transcribed — they appear here automatically.
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {query || filter !== "all" ? "Nothing matches that filter." : "No transcripts yet — upload a file or wait for the next sync."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((t) => {
            const { label, Icon } = sourceMeta[t.source];
            const duration = formatDuration(t.duration_seconds);
            return (
              <li key={t.id}
                className="group flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3.5 transition-colors hover:border-primary/40 hover:bg-accent/40">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <button className="min-w-0 flex-1 text-left" onClick={() => t.status === "ready" && setSelected(t)}>
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{label}</span>
                    <span aria-hidden>·</span>
                    <span>{formatDate(t.occurred_at ?? t.created_at)}</span>
                    {duration && (<><span aria-hidden>·</span><span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{duration}</span></>)}
                    {t.participants.length > 0 && (
                      <><span aria-hidden>·</span>
                        <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{t.participants.slice(0, 3).join(", ")}
                          {t.participants.length > 3 && ` +${t.participants.length - 3}`}</span></>
                    )}
                  </p>
                  {t.status === "ready" && t.segments[0] && (
                    <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground/80">
                      “{t.segments[0].text}”
                    </p>
                  )}
                  {t.status === "processing" && <p className="mt-1.5 text-xs text-muted-foreground">Transcribing audio…</p>}
                  {t.status === "failed" && <p className="mt-1.5 text-xs text-destructive">{t.error_message ?? "Failed"}</p>}
                </button>
                {t.status === "failed" && <AlertTriangle className="mt-1 h-4 w-4 text-destructive" />}
                {t.status === "processing" && <Loader2 className="mt-1 h-4 w-4 animate-spin text-muted-foreground" />}
                <div className="flex items-center opacity-60 transition-opacity group-hover:opacity-100">
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={t.status !== "ready"}
                    onClick={() => handleDownload(t)} aria-label="Download transcript">
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy === t.id}
                    onClick={() => handleDelete(t)} aria-label="Delete transcript">
                    {busy === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="w-full overflow-hidden p-0 sm:max-w-xl lg:max-w-2xl">
          {selected && <TranscriptDetail transcript={selected} />}
        </SheetContent>
      </Sheet>

    </main>
  );
}
