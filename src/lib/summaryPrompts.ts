import { supabase } from "@/integrations/supabase/client";

export interface SummaryPrompt {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  match_hints: string | null;
  body: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export async function fetchPrompts(): Promise<SummaryPrompt[]> {
  const { data, error } = await (supabase as any)
    .from("summary_prompts")
    .select("*")
    .order("is_system", { ascending: false })
    .order("name");
  if (error) throw error;
  return (data ?? []) as SummaryPrompt[];
}

export async function createPrompt(
  userId: string,
  input: { name: string; description: string; match_hints: string; body: string },
): Promise<SummaryPrompt> {
  const { data, error } = await (supabase as any)
    .from("summary_prompts")
    .insert({ ...input, user_id: userId, is_system: false })
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
export async function summarizeTranscript(transcriptId: string) {
  const { data, error } = await supabase.functions.invoke("transcripts-summarize", {
    body: { transcript_id: transcriptId },
  });
  if (error) throw new Error((data as any)?.error ?? error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { status: string; prompt?: string };
}
