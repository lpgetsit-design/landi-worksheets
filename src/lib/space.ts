import { supabase } from "@/integrations/supabase/client";

export interface SpaceFolder {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface FolderNode extends SpaceFolder {
  children: FolderNode[];
}

export const listFolders = async (): Promise<SpaceFolder[]> => {
  const { data, error } = await supabase
    .from("space_folders")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []) as SpaceFolder[];
};

export const buildFolderTree = (folders: SpaceFolder[]): FolderNode[] => {
  const map = new Map<string, FolderNode>();
  folders.forEach((f) => map.set(f.id, { ...f, children: [] }));
  const roots: FolderNode[] = [];
  map.forEach((node) => {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortRec = (arr: FolderNode[]) => {
    arr.sort((a, b) => a.name.localeCompare(b.name));
    arr.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
};

export const createFolder = async (
  userId: string,
  name: string,
  parentId: string | null,
): Promise<SpaceFolder> => {
  const { data, error } = await supabase
    .from("space_folders")
    .insert({ user_id: userId, name: name.trim() || "Untitled", parent_id: parentId })
    .select()
    .single();
  if (error) throw error;
  return data as SpaceFolder;
};

export const renameFolder = async (id: string, name: string) => {
  const { error } = await supabase
    .from("space_folders")
    .update({ name: name.trim() || "Untitled" })
    .eq("id", id);
  if (error) throw error;
};

export const deleteFolder = async (id: string) => {
  // Children cascade. Items inside (worksheets/designs) get folder_id set to NULL.
  const { error } = await supabase.from("space_folders").delete().eq("id", id);
  if (error) throw error;
};

export const moveDesignToFolder = async (designId: string, folderId: string | null) => {
  const { error } = await supabase
    .from("chat_designs")
    .update({ folder_id: folderId })
    .eq("id", designId);
  if (error) throw error;
};

export const moveWorksheetToFolder = async (worksheetId: string, folderId: string | null) => {
  const { error } = await supabase
    .from("worksheets")
    .update({ folder_id: folderId })
    .eq("id", worksheetId);
  if (error) throw error;
};

/** Save a design to Space: mark status=saved and assign folder. */
export const saveDesignToSpace = async (
  designId: string,
  folderId: string | null,
  title?: string,
) => {
  const payload: Record<string, unknown> = { status: "saved", folder_id: folderId };
  if (title !== undefined) payload.title = title;
  const { error } = await supabase.from("chat_designs").update(payload).eq("id", designId);
  if (error) throw error;
};

/** Build a human-readable path like "My Space / Q1 Outreach / Acme". */
export const folderPath = (
  folders: SpaceFolder[],
  folderId: string | null,
): string => {
  if (!folderId) return "My Space";
  const byId = new Map(folders.map((f) => [f.id, f]));
  const parts: string[] = [];
  let cur = byId.get(folderId);
  while (cur) {
    parts.unshift(cur.name);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return ["My Space", ...parts].join(" / ");
};