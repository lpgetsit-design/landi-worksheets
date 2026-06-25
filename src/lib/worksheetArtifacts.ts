import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { WorksheetRevision } from "@/lib/worksheets";

export interface ChatWorksheet {
  id: string;
  title: string;
  status: "active" | "saved";
  folder_id: string | null;
  updated_at: string;
  content_md: string | null;
  content_html: string | null;
  content_json: Json | null;
  revisions: WorksheetRevision[];
}

/**
 * Load every worksheet that lives inside a chat session, with its revision history.
 */
export const loadSessionWorksheets = async (sessionId: string): Promise<ChatWorksheet[]> => {
  const { data, error } = await supabase
    .from("worksheets")
    .select(
      "id,title,status,folder_id,updated_at,content_md,content_html,content_json,worksheet_revisions(id,revision_index,content_json,content_md,content_html,created_at)",
    )
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data as any[]) || []).map((w) => ({
    id: w.id,
    title: w.title || "Untitled worksheet",
    status: (w.status || "saved") as "active" | "saved",
    folder_id: w.folder_id ?? null,
    updated_at: w.updated_at,
    content_md: w.content_md ?? null,
    content_html: w.content_html ?? null,
    content_json: w.content_json ?? null,
    revisions: ((w.worksheet_revisions as any[]) || [])
      .map((r) => ({
        id: r.id,
        revision_index: r.revision_index,
        content_md: r.content_md ?? null,
        content_html: r.content_html ?? null,
        content_json: r.content_json ?? null,
        created_at: r.created_at,
      }))
      .sort((a, b) => a.revision_index - b.revision_index),
  }));
};

/**
 * Ensure exactly one worksheet for the session is `active`. Creates one if none exists.
 * Mirrors `ensureActiveDesign` for designs.
 */
export const ensureActiveWorksheet = async (
  sessionId: string,
  userId: string,
  titleHint: string,
): Promise<{ id: string; title: string }> => {
  const { data: existing } = await supabase
    .from("worksheets")
    .select("id,title")
    .eq("session_id", sessionId)
    .eq("status", "active")
    .limit(1);
  if (existing && existing.length > 0) return existing[0] as { id: string; title: string };

  const title = autoTitleFromText(titleHint);
  const { data, error } = await supabase
    .from("worksheets")
    .insert({
      user_id: userId,
      title,
      document_type: "note",
      session_id: sessionId,
      status: "active",
    })
    .select("id,title")
    .single();
  if (error || !data) throw new Error("Could not create worksheet draft");
  return data as { id: string; title: string };
};

const autoTitleFromText = (text: string): string => {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "Worksheet";
  return cleaned.length > 60 ? cleaned.slice(0, 57) + "…" : cleaned;
};

/**
 * Append a new immutable revision to the worksheet and keep `worksheets.content_*`
 * in sync with the latest revision so legacy share/preview paths keep working.
 */
export const appendWorksheetRevision = async (
  worksheetId: string,
  content: { content_md?: string | null; content_html?: string | null; content_json?: Json | null },
  promptMessageId: string | null = null,
): Promise<WorksheetRevision> => {
  const { data: lastRev } = await supabase
    .from("worksheet_revisions")
    .select("revision_index")
    .eq("worksheet_id", worksheetId)
    .order("revision_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextIdx = ((lastRev?.revision_index ?? -1) + 1) as number;

  const { data, error } = await supabase
    .from("worksheet_revisions")
    .insert({
      worksheet_id: worksheetId,
      revision_index: nextIdx,
      content_md: content.content_md ?? null,
      content_html: content.content_html ?? null,
      content_json: content.content_json ?? null,
      prompt_message_id: promptMessageId,
    })
    .select()
    .single();
  if (error || !data) throw error || new Error("Could not append worksheet revision");

  // Keep the worksheet row in sync so share/preview/PDF reads stay correct.
  await supabase
    .from("worksheets")
    .update({
      content_md: content.content_md ?? null,
      content_html: content.content_html ?? null,
      content_json: (content.content_json ?? null) as Json,
    })
    .eq("id", worksheetId);

  return {
    id: data.id,
    revision_index: data.revision_index,
    content_md: data.content_md,
    content_html: data.content_html,
    content_json: data.content_json,
    created_at: data.created_at,
  } as WorksheetRevision;
};

export const renameWorksheet = async (worksheetId: string, title: string) => {
  await supabase.from("worksheets").update({ title }).eq("id", worksheetId);
};

/** Save the active worksheet into Space (folder + saved status). */
export const saveWorksheetToSpace = async (
  worksheetId: string,
  folderId: string | null,
  title?: string,
) => {
  const payload: Record<string, unknown> = { status: "saved", folder_id: folderId };
  if (title !== undefined) payload.title = title;
  const { error } = await supabase.from("worksheets").update(payload).eq("id", worksheetId);
  if (error) throw error;
};

/** Promote a saved worksheet back to active (demoting any other active one). */
export const reopenSavedWorksheet = async (sessionId: string, worksheetId: string) => {
  // Demote any active worksheet in the same session.
  await supabase
    .from("worksheets")
    .update({ status: "saved" })
    .eq("session_id", sessionId)
    .eq("status", "active");
  const { error } = await supabase
    .from("worksheets")
    .update({ status: "active" })
    .eq("id", worksheetId);
  if (error) throw error;
};