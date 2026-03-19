import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type DocumentType = "note" | "skill" | "prompt" | "template" | "design";

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

export const createWorksheet = async (userId: string, title = "Untitled", documentType: DocumentType = "note") => {
  const { data, error } = await supabase
    .from("worksheets")
    .insert({ user_id: userId, title, document_type: documentType })
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

// --- Entity association helpers ---

interface CrmBadgeAttrs {
  entityType: string;
  entityId: string;
  label: string;
}

function extractCrmBadges(node: any): CrmBadgeAttrs[] {
  const results: CrmBadgeAttrs[] = [];
  if (!node) return results;
  if (node.type === "crmBadge" && node.attrs) {
    results.push({
      entityType: node.attrs.entityType || "",
      entityId: node.attrs.entityId || "",
      label: node.attrs.label || "",
    });
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      results.push(...extractCrmBadges(child));
    }
  }
  return results;
}

export const syncWorksheetEntities = async (worksheetId: string, contentJson: Json | null) => {
  const badges = extractCrmBadges(contentJson);

  // Delete existing
  const { error: delError } = await supabase
    .from("worksheet_entities")
    .delete()
    .eq("worksheet_id", worksheetId);
  if (delError) throw delError;

  if (badges.length === 0) return;

  // Deduplicate by entity_type + entity_id
  const seen = new Set<string>();
  const rows = badges.filter((b) => {
    const key = `${b.entityType}:${b.entityId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((b) => ({
    worksheet_id: worksheetId,
    entity_type: b.entityType,
    entity_id: b.entityId,
    label: b.label,
  }));

  const { error: insError } = await supabase
    .from("worksheet_entities")
    .insert(rows);
  if (insError) throw insError;
};

export const getWorksheetEntities = async () => {
  const { data, error } = await supabase
    .from("worksheet_entities")
    .select("worksheet_id, entity_type, entity_id, label");
  if (error) throw error;
  return data;
};

// --- Linked worksheet helpers ---

interface WorksheetLink {
  id: string;
  title: string;
}

function extractWorksheetBadges(node: any): WorksheetLink[] {
  const results: WorksheetLink[] = [];
  if (!node) return results;
  if (node.type === "worksheetBadge" && node.attrs) {
    results.push({
      id: node.attrs.worksheetId || "",
      title: node.attrs.title || "",
    });
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      results.push(...extractWorksheetBadges(child));
    }
  }
  return results;
}

const SUMMARIZE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/summarize-worksheet`;

const EMBED_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/embed-worksheet`;

/** Call OpenAI to generate and store vector embedding for the worksheet */
export const generateAndSaveEmbedding = async (
  worksheetId: string,
  title: string,
  content: string
) => {
  try {
    if (!worksheetId || !content?.trim()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const resp = await fetch(EMBED_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ worksheetId, title, content }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.error("Embedding error:", resp.status, t);
    }
  } catch (e) {
    console.error("Embedding generation failed:", e);
  }
};

/** Call AI to summarise the worksheet and save result in meta.summary */
export const generateAndSaveSummary = async (
  worksheetId: string,
  title: string,
  content: string,
  documentType: string
) => {
  try {
    if (!worksheetId || !content?.trim()) return;
    const resp = await fetch(SUMMARIZE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ title, content, documentType }),
    });
    if (!resp.ok) return; // silently skip on failure
    const { summary } = await resp.json();
    if (!summary) return;

    // Merge into existing meta
    const { data: ws } = await supabase
      .from("worksheets")
      .select("meta")
      .eq("id", worksheetId)
      .single();

    const currentMeta = (ws?.meta as Record<string, unknown>) || {};
    const newMeta = {
      ...currentMeta,
      summary,
      summary_updated_at: new Date().toISOString(),
    };

    await supabase
      .from("worksheets")
      .update({ meta: newMeta as unknown as Json })
      .eq("id", worksheetId);
  } catch (e) {
    console.error("Summary generation failed:", e);
  }
};

const EXTRACT_KEYWORDS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-keywords`;

/** Call AI to extract keywords and save to meta.keywords */
export const generateAndSaveKeywords = async (
  worksheetId: string,
  title: string,
  content: string,
  documentType: string
) => {
  try {
    if (!worksheetId || !content?.trim()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const resp = await fetch(EXTRACT_KEYWORDS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ worksheetId, title, content, documentType }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.error("Keyword extraction error:", resp.status, t);
    }
  } catch (e) {
    console.error("Keyword extraction failed:", e);
  }
};

/** Sync linked_worksheets array in the meta JSON column for quick filtering */
export const syncLinkedWorksheets = async (worksheetId: string, contentJson: Json | null) => {
  const links = extractWorksheetBadges(contentJson);

  // Deduplicate by id
  const seen = new Set<string>();
  const unique = links.filter((l) => {
    if (seen.has(l.id)) return false;
    seen.add(l.id);
    return true;
  });

  // Read current meta
  const { data: ws } = await supabase
    .from("worksheets")
    .select("meta")
    .eq("id", worksheetId)
    .single();

  const currentMeta = (ws?.meta as Record<string, unknown>) || {};
  const newMeta = { ...currentMeta, linked_worksheets: unique };

  await supabase
    .from("worksheets")
    .update({ meta: newMeta as unknown as Json })
    .eq("id", worksheetId);
};

// --- Hybrid search ---

const SEARCH_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/search-worksheets`;

export interface HybridSearchResult {
  id: string;
  title: string;
  document_type: string;
  content_md: string | null;
  meta: Record<string, unknown> | null;
  updated_at: string;
  created_at: string;
  similarity_score: number;
  keyword_score: number;
  combined_score: number;
}

export const hybridSearchWorksheets = async (
  query: string,
  matchCount = 20
): Promise<{ results: HybridSearchResult[]; queryKeywords: string[] }> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const resp = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ query, matchCount }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Search failed: ${t}`);
  }

  return resp.json();
};
