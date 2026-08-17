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

export interface SummarySection {
  heading: string;
  bullets: SummaryBullet[];
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
    summary_status: (row.summary_status ?? "pending") as SummaryStatus,
  } as Transcript;
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
