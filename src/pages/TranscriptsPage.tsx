import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Upload, RefreshCw, Loader2, Trash2, Download, FileAudio, Video, FileText, Plug, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  fetchTranscripts, uploadTranscriptFile, deleteTranscript, downloadTranscript,
  syncTeams, syncRingCentral, fetchIntegrations, saveIntegration,
  type Transcript, type IntegrationLink,
} from "@/lib/transcripts";

const sourceMeta: Record<Transcript["source"], { label: string; Icon: typeof FileText }> = {
  upload: { label: "Uploaded", Icon: FileText },
  teams: { label: "Teams meeting", Icon: Video },
  ringcentral: { label: "Phone call", Icon: FileAudio },
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function TranscriptsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Transcript[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Transcript | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationLink[]>([]);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [msValue, setMsValue] = useState("");
  const [rcValue, setRcValue] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

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

  const processingCount = useMemo(() => items.filter((i) => i.status === "processing").length, [items]);

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

  const runSync = async (kind: "teams" | "ringcentral") => {
    setBusy(kind);
    try {
      const res = kind === "teams" ? await syncTeams() : await syncRingCentral();
      const parts = [`${res.imported} imported`, `${res.skipped} skipped`];
      if (res.processing) parts.push(`${res.processing} still transcribing`);
      toast.success(parts.join(" · "));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (t: Transcript) => {
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
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transcripts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your private library of conversations. Only you can see these.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" multiple accept=".txt,.vtt,.srt,text/*" className="hidden"
            onChange={(e) => handleUpload(e.target.files)} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy === "upload"}>
            {busy === "upload" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
            Upload
          </Button>
          <Button variant="outline" size="sm" onClick={() => runSync("teams")} disabled={busy === "teams"}>
            {busy === "teams" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Video className="mr-1.5 h-4 w-4" />}
            Sync Teams
          </Button>
          <Button variant="outline" size="sm" onClick={() => runSync("ringcentral")} disabled={busy === "ringcentral"}>
            {busy === "ringcentral" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileAudio className="mr-1.5 h-4 w-4" />}
            Sync RingCentral
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

      {processingCount > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4" />
          {processingCount} phone recording{processingCount > 1 ? "s are" : " is"} still being transcribed. Sync RingCentral again in a few minutes.
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">No transcripts yet — upload a file or sync Teams / RingCentral.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((t) => {
            const { label, Icon } = sourceMeta[t.source];
            return (
              <li key={t.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/40">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <button className="min-w-0 flex-1 text-left" onClick={() => t.status === "ready" && setSelected(t)}>
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {label} · {formatDate(t.occurred_at ?? t.created_at)}
                    {t.status === "processing" && " · transcribing…"}
                    {t.status === "failed" && " · failed"}
                  </p>
                </button>
                {t.status === "failed" && <AlertTriangle className="h-4 w-4 text-destructive" />}
                {t.status === "processing" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={t.status !== "ready"}
                  onClick={() => downloadTranscript(t)} aria-label="Download transcript">
                  <Download className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy === t.id}
                  onClick={() => handleDelete(t)} aria-label="Delete transcript">
                  {busy === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.title}</DialogTitle>
            <DialogDescription>
              {selected && `${sourceMeta[selected.source].label} · ${formatDate(selected.occurred_at ?? selected.created_at)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm leading-relaxed">
            {selected?.segments.length
              ? selected.segments.map((s, i) => (
                  <p key={i}>
                    <span className="font-medium text-foreground">{s.speaker}: </span>
                    <span className="text-muted-foreground">{s.text}</span>
                  </p>
                ))
              : <p className="whitespace-pre-wrap text-muted-foreground">{selected?.content_text}</p>}
          </div>
          {selected && (
            <Button variant="outline" size="sm" onClick={() => downloadTranscript(selected)}>
              <Download className="mr-1.5 h-4 w-4" />Download
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
