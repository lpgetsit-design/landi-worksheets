import { supabase } from "@/integrations/supabase/client";

export type TranscriptSource = "upload" | "teams" | "ringcentral";
export type TranscriptStatus = "ready" | "processing" | "failed";
export type SummaryStatus = "pending" | "running" | "ready" | "failed";

export interface TranscriptSegment {
  speaker: string;
  text: string;
}

export interface SummaryBullet {
  text: string;
  children?: string[];
}

export type SectionFormat = "bullets" | "table" | "key_value" | "checklist" | "paragraph";

export interface SummarySection {
  heading: string;
  /** Call type this section belongs to. */
  category?: string;
  format?: SectionFormat;
  bullets?: SummaryBullet[];
  columns?: string[];
  rows?: string[][];
  pairs?: { key: string; value: string }[];
  checklist?: { item: string; status: "done" | "open" | "unknown" }[];
  paragraph?: string;
}

/** Framed call summary: overview on top, topic sections, combined next steps. */
export interface CallSummary {
  overview: string | null;
  sections: SummarySection[];
  next_steps: string[];
}

export interface SummaryTopic {
  id: string;
  name: string;
  confidence: number;
}

export interface SummarySnapshot extends CallSummary {
  categories?: SummaryTopic[];
  saved_at: string;
  reason?: string;
}

export interface Transcript {
  id: string;
  user_id: string;
  source: TranscriptSource;
  title: string;
  external_id: string | null;
  occurred_at: string | null;
  duration_seconds: number | null;
  participants: string[];
  content_text: string | null;
  segments: TranscriptSegment[];
  status: TranscriptStatus;
  error_message: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
  summary_prompt_id?: string | null;
  summary_status?: SummaryStatus;
  summary_sections?: SummarySection[];
  summary_overview?: string | null;
  summary_next_steps?: string[];
  summary_categories?: SummaryTopic[];
  summary_history?: SummarySnapshot[];
  summary_started_at?: string | null;
  summary_error?: string | null;
  classified_reason?: string | null;
  summarized_at?: string | null;
}

const TABLE = "transcripts" as const;

function normalize(row: any): Transcript {
  return {
    ...row,
    participants: Array.isArray(row.participants) ? row.participants : [],
    segments: Array.isArray(row.segments) ? row.segments : [],
    summary_sections: Array.isArray(row.summary_sections) ? row.summary_sections : [],
    summary_next_steps: Array.isArray(row.summary_next_steps) ? row.summary_next_steps : [],
    summary_categories: Array.isArray(row.summary_categories) ? row.summary_categories : [],
    summary_history: Array.isArray(row.summary_history) ? row.summary_history : [],
    summary_status: (row.summary_status ?? "pending") as SummaryStatus,
  } as Transcript;
}

export function normalizeTranscript(row: any): Transcript {
  return normalize(row);
}

export function currentSummary(t: Transcript): CallSummary {
  return {
    overview: t.summary_overview ?? null,
    sections: t.summary_sections ?? [],
    next_steps: t.summary_next_steps ?? [],
  };
}

/** Save an edited summary (e.g. from Ask Landi), keeping the previous one for undo. */
export async function saveEditedSummary(t: Transcript, next: CallSummary): Promise<Transcript> {
  const prev: SummarySnapshot = {
    ...currentSummary(t),
    categories: t.summary_categories,
    saved_at: new Date().toISOString(),
    reason: "edit",
  };
  const patch = {
    summary_overview: next.overview,
    summary_sections: next.sections,
    summary_next_steps: next.next_steps,
    summary_status: "ready" as const,
    summary_history: [prev, ...(t.summary_history ?? [])].slice(0, 10),
  };
  const { error } = await (supabase as any).from(TABLE).update(patch).eq("id", t.id);
  if (error) throw error;
  return { ...t, ...patch };
}

/** One-click undo: restore the most recent previous summary. */
export async function undoSummary(t: Transcript): Promise<Transcript> {
  const [last, ...rest] = t.summary_history ?? [];
  if (!last) return t;
  const patch: Partial<Transcript> = {
    summary_overview: last.overview ?? null,
    summary_sections: last.sections ?? [],
    summary_next_steps: last.next_steps ?? [],
    summary_status: "ready",
    summary_history: rest,
    ...(last.categories ? { summary_categories: last.categories } : {}),
  };
  const { error } = await (supabase as any).from(TABLE).update(patch).eq("id", t.id);
  if (error) throw error;
  return { ...t, ...patch };
}

export async function fetchTranscripts(): Promise<Transcript[]> {
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalize);
}

/** Parse a plain-text / VTT-ish transcript into speaker segments. */
export function parseTranscriptText(raw: string): { segments: TranscriptSegment[]; text: string } {
  const segments: TranscriptSegment[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "WEBVTT" || /^\d+$/.test(trimmed) || trimmed.includes("-->")) continue;
    const vtt = trimmed.match(/^<v\s+([^>]+)>(.*?)(<\/v>)?$/);
    const named = vtt ? null : trimmed.match(/^([A-Za-z0-9 .,'_-]{1,40}):\s*(.+)$/);
    const speaker = vtt ? vtt[1].trim() : named ? named[1].trim() : "Speaker";
    const text = (vtt ? vtt[2] : named ? named[2] : trimmed).replace(/<[^>]+>/g, "").trim();
    if (!text) continue;
    const last = segments[segments.length - 1];
    if (last && last.speaker === speaker) last.text += " " + text;
    else segments.push({ speaker, text });
  }
  return { segments, text: segments.map((s) => `${s.speaker}: ${s.text}`).join("\n\n") };
}

export async function uploadTranscriptFile(userId: string, file: File): Promise<Transcript> {
  const raw = await file.text();
  if (!raw.trim()) throw new Error("That file is empty");
  const { segments, text } = parseTranscriptText(raw);

  const filePath = `${userId}/uploads/${crypto.randomUUID()}_${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("transcripts")
    .upload(filePath, file, { contentType: file.type || "text/plain", upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await (supabase as any)
    .from(TABLE)
    .insert({
      user_id: userId,
      source: "upload",
      title: file.name.replace(/\.[^.]+$/, ""),
      content_text: text,
      segments,
      status: "ready",
      file_path: filePath,
      file_name: file.name,
      file_size: file.size,
    })
    .select()
    .single();
  if (error) throw error;
  return normalize(data);
}

export async function deleteTranscript(t: Transcript) {
  if (t.file_path) await supabase.storage.from("transcripts").remove([t.file_path]);
  const { error } = await (supabase as any).from(TABLE).delete().eq("id", t.id);
  if (error) throw error;
}

export function downloadTranscript(t: Transcript) {
  const body = t.content_text ?? t.segments.map((s) => `${s.speaker}: ${s.text}`).join("\n\n");
  const blob = new Blob([`${t.title}\n\n${body}`], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${t.title.replace(/[^\w -]+/g, "_")}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function syncTeams() {
  const { data, error } = await supabase.functions.invoke("transcripts-sync-teams", { body: {} });
  if (error) throw new Error((data as any)?.error ?? error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { imported: number; skipped: number; processing: number };
}

export async function syncRingCentral() {
  const { data, error } = await supabase.functions.invoke("transcripts-sync-ringcentral", { body: {} });
  if (error) throw new Error((data as any)?.error ?? error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { imported: number; skipped: number; completed: number; processing: number };
}

export interface IntegrationLink {
  provider: "microsoft" | "ringcentral";
  external_user_id: string | null;
  external_email: string | null;
}

export async function fetchIntegrations(): Promise<IntegrationLink[]> {
  const { data, error } = await (supabase as any)
    .from("user_integrations")
    .select("provider, external_user_id, external_email");
  if (error) throw error;
  return (data ?? []) as IntegrationLink[];
}

export async function saveIntegration(
  userId: string,
  provider: "microsoft" | "ringcentral",
  value: string,
) {
  const payload =
    provider === "microsoft"
      ? { user_id: userId, provider, external_email: value, external_user_id: value }
      : { user_id: userId, provider, external_user_id: value };
  const { error } = await (supabase as any)
    .from("user_integrations")
    .upsert(payload, { onConflict: "user_id,provider" });
  if (error) throw error;
}
