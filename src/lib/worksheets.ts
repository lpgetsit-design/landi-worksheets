import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type DocumentType = "note" | "skill" | "prompt" | "template";

export interface Worksheet {
  id: string;
  user_id: string;
  title: string;
  document_type: DocumentType;
  content_json: Json | null;
  content_html: string | null;
  content_md: string | null;
  meta: Json | null;
  created_at: string;
  updated_at: string;
}

export const createWorksheet = async (userId: string, title = "Untitled") => {
  const { data, error } = await supabase
    .from("worksheets")
    .insert({ user_id: userId, title })
    .select()
    .single();
  if (error) throw error;
  return data as Worksheet;
};

export const getWorksheets = async () => {
  const { data, error } = await supabase
    .from("worksheets")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as Worksheet[];
};

export const getWorksheet = async (id: string) => {
  const { data, error } = await supabase
    .from("worksheets")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as Worksheet;
};

export const updateWorksheet = async (
  id: string,
  updates: {
    title?: string;
    content_json?: Json;
    content_html?: string;
    content_md?: string;
  }
) => {
  const { data, error } = await supabase
    .from("worksheets")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Worksheet;
};

export const deleteWorksheet = async (id: string) => {
  const { error } = await supabase
    .from("worksheets")
    .delete()
    .eq("id", id);
  if (error) throw error;
};
