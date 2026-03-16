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

// --- Workflow projection helpers ---

interface WorkflowCardProjection {
  entityType: string;
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigneeId: string;
  assigneeLabel: string;
  dueDate: string;
  labels: string;
  laneStageKey: string;
}

interface WorkflowLaneProjection {
  id: string;
  title: string;
  stageKey: string;
  wipLimit: number;
}

function extractWorkflowNodes(node: any, currentLaneStageKey = ""): { cards: WorkflowCardProjection[]; lanes: WorkflowLaneProjection[] } {
  const cards: WorkflowCardProjection[] = [];
  const lanes: WorkflowLaneProjection[] = [];
  if (!node) return { cards, lanes };

  if (node.type === "workflowLane" && node.attrs) {
    lanes.push({
      id: node.attrs.id || "",
      title: node.attrs.title || "",
      stageKey: node.attrs.stageKey || "",
      wipLimit: node.attrs.wipLimit || 0,
    });
    currentLaneStageKey = node.attrs.stageKey || "";
  }

  if (node.type === "workflowCard" && node.attrs) {
    cards.push({
      entityType: "workflowCard",
      id: node.attrs.id || "",
      title: node.attrs.title || "",
      description: node.attrs.description || "",
      status: node.attrs.status || "backlog",
      priority: node.attrs.priority || "medium",
      assigneeId: node.attrs.assigneeId || "",
      assigneeLabel: node.attrs.assigneeLabel || "",
      dueDate: node.attrs.dueDate || "",
      labels: node.attrs.labels || "[]",
      laneStageKey: currentLaneStageKey,
    });
  }

  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      const result = extractWorkflowNodes(child, currentLaneStageKey);
      cards.push(...result.cards);
      lanes.push(...result.lanes);
    }
  }

  return { cards, lanes };
}

export const syncWorkflowProjections = async (worksheetId: string, contentJson: Json | null) => {
  const { cards, lanes } = extractWorkflowNodes(contentJson);

  // Delete existing projections
  const [{ error: delCards }, { error: delLanes }] = await Promise.all([
    supabase.from("workflow_cards").delete().eq("worksheet_id", worksheetId),
    supabase.from("workflow_lanes").delete().eq("worksheet_id", worksheetId),
  ]);
  if (delCards) throw delCards;
  if (delLanes) throw delLanes;

  // Insert lanes
  if (lanes.length > 0) {
    const laneRows = lanes.map((l, i) => ({
      worksheet_id: worksheetId,
      lane_node_id: l.id,
      title: l.title,
      stage_key: l.stageKey,
      wip_limit: l.wipLimit || null,
      sort_order: i,
    }));
    const { error } = await supabase.from("workflow_lanes").insert(laneRows);
    if (error) throw error;
  }

  // Insert cards
  if (cards.length > 0) {
    const cardRows = cards.map((c, i) => ({
      worksheet_id: worksheetId,
      card_node_id: c.id,
      title: c.title,
      description: c.description || null,
      status: c.status,
      priority: c.priority,
      assignee_id: c.assigneeId || null,
      assignee_label: c.assigneeLabel || null,
      due_date: c.dueDate || null,
      labels: JSON.parse(c.labels || "[]"),
      lane_stage_key: c.laneStageKey || null,
      sort_order: i,
    }));
    const { error } = await supabase.from("workflow_cards").insert(cardRows);
    if (error) throw error;
  }
};

export const getWorksheetEntities = async () => {
  const { data, error } = await supabase
    .from("worksheet_entities")
    .select("worksheet_id, entity_type, entity_id, label");
  if (error) throw error;
  return data;
};
