import { supabase } from "@/integrations/supabase/client";

export interface CallTypeSection {
  title: string;
  format: "bullets" | "table" | "key_value" | "checklist" | "paragraph";
  columns?: string[];
  keys?: string[];
  instructions?: string;
}

export interface CallTypeDraft {
  name: string;
  description?: string;
  detect_when: string;
  notes?: string;
  sections: CallTypeSection[];
}

export interface SummaryPrompt {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  match_hints: string | null;
  body: string;
  is_system: boolean;
  slug: string | null;
  detect_when: string | null;
  notes: string | null;
  distinct_from: string | null;
  category_group: string | null;
  sort_order: number;
  sections: CallTypeSection[];
  created_at: string;
  updated_at: string;
}

export async function fetchPrompts(): Promise<SummaryPrompt[]> {
  const { data, error } = await (supabase as any)
    .from("summary_prompts")
    .select("*")
    .order("is_system", { ascending: false })
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return (data ?? []) as SummaryPrompt[];
}

export async function createPrompt(
  userId: string,
  input: CallTypeDraft,
): Promise<SummaryPrompt> {
  const { data, error } = await (supabase as any)
    .from("summary_prompts")
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      detect_when: input.detect_when.trim(),
      notes: input.notes?.trim() || null,
      sections: input.sections,
      user_id: userId,
      is_system: false,
      body: "",
    })
    .select()
    .single();
  if (error) {
    if ((error as any).code === "23505") {
      throw new Error("That name is already taken — prompt names must be unique. Pick a new name.");
    }
    throw error;
  }
  return data as SummaryPrompt;
}

export async function deletePrompt(id: string) {
  const { error } = await (supabase as any).from("summary_prompts").delete().eq("id", id);
  if (error) throw error;
}

/** Classify + summarise a transcript. Runs automatically after upload and sync. */
export async function summarizeTranscript(transcriptId: string, categoryIds?: string[]) {
  const { data, error } = await supabase.functions.invoke("transcripts-summarize", {
    body: { transcript_id: transcriptId, ...(categoryIds ? { category_ids: categoryIds } : {}) },
  });
  if (error) throw new Error((data as any)?.error ?? error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { status: string; prompt?: string };
}

/** Client-side check for a drafted call type (the database checks again on save). */
export function validateCallTypeDraft(d: CallTypeDraft | null): string | null {
  if (!d) return "No draft yet";
  if (!d.name?.trim()) return "The draft needs a name";
  if (d.name.trim().toLowerCase() === "general") return "That name is reserved";
  if (!d.detect_when?.trim()) return "The draft needs a yes/no question for when it applies";
  if (!Array.isArray(d.sections) || d.sections.length < 1 || d.sections.length > 4) return "The draft needs 1 to 4 sections";
  const seen = new Set<string>();
  for (const s of d.sections) {
    const t = (s.title ?? "").trim().toLowerCase();
    if (!t) return "Every section needs a title";
    if (["call overview", "overview", "next steps"].includes(t)) return "Call overview and Next steps are always written by Landi";
    if (seen.has(t)) return "Section titles must be unique";
    seen.add(t);
    if (!["bullets", "table", "key_value", "checklist", "paragraph"].includes(s.format)) return `"${s.title}" has an unknown layout`;
    if (s.format === "table" && !s.columns?.length) return `"${s.title}" needs columns`;
    if (s.format === "key_value" && !s.keys?.length) return `"${s.title}" needs keys`;
  }
  if (JSON.stringify(d).length > 4000) return "The draft is too long — keep it to about 3,000 characters";
  return null;
}

/** Run a draft call type on one of the recruiter's calls without saving anything. */
export async function previewCallType(transcriptId: string, draft: CallTypeDraft, withId?: string) {
  const { data, error } = await supabase.functions.invoke("transcripts-summarize", {
    body: { transcript_id: transcriptId, preview_draft: draft, preview_with: withId ?? null },
  });
  if (error) throw new Error((data as any)?.error ?? error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return (data as any).summary as import("./transcripts").CallSummary;
}
