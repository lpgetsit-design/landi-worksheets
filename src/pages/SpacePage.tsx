import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useSpaceTree } from "@/hooks/useSpaceTree";
import FolderTree from "@/components/space/FolderTree";
import {
  createFolder,
  renameFolder,
  deleteFolder,
  folderPath,
} from "@/lib/space";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Home,
  Folder,
  FileText,
  Sparkles,
  ChevronRight,
  Plus,
  Loader2,
  PanelRight,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
} from "lucide-react";
import DesignPreview from "@/components/design/DesignPreview";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createWorksheet } from "@/lib/worksheets";

interface DesignItem {
  id: string;
  title: string;
  updated_at: string;
  session_id: string;
  worksheet_id: string | null;
  latestHtml: string;
}

interface WorksheetItem {
  id: string;
  title: string;
  document_type: string;
  updated_at: string;
}

const SpacePage = () => {
  const { folderId: routeFolderId } = useParams<{ folderId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { tree, folders, isLoading: foldersLoading } = useSpaceTree();
  const [sideOpen, setSideOpen] = useState(true);
  const selectedId = routeFolderId ?? null;

  const selectFolder = (id: string | null) => {
    navigate(id ? `/space/folder/${id}` : "/space");
  };

  // Children folders for the breadcrumb / pane.
  const childFolders = useMemo(
    () => folders.filter((f) => (f.parent_id ?? null) === selectedId),
    [folders, selectedId],
  );

  // Designs in current folder.
  const { data: designs = [], isLoading: dLoading } = useQuery({
    queryKey: ["space_designs", selectedId, user?.id],
    enabled: !!user,
    queryFn: async (): Promise<DesignItem[]> => {
      const q = supabase
        .from("chat_designs")
        .select(
          "id,title,updated_at,session_id,chat_sessions(worksheet_id),chat_design_revisions(revision_index,html)",
        )
        .eq("status", "saved")
        .order("updated_at", { ascending: false });
      const { data, error } = selectedId
        ? await q.eq("folder_id", selectedId)
        : await q.is("folder_id", null);
      if (error) throw error;
      return ((data as any[]) || [])
        .map((d) => {
          const revs = (d.chat_design_revisions || []) as any[];
          if (revs.length === 0) return null;
          const latest = revs.reduce((a, b) =>
            (b.revision_index ?? 0) > (a.revision_index ?? 0) ? b : a,
          );
          return {
            id: d.id,
            title: d.title || "Untitled design",
            updated_at: d.updated_at,
            session_id: d.session_id,
            worksheet_id: d.chat_sessions?.worksheet_id ?? null,
            latestHtml: latest.html || "",
          } as DesignItem;
        })
        .filter(Boolean) as DesignItem[];
    },
  });

  // Worksheets in current folder.
  const { data: worksheets = [], isLoading: wLoading } = useQuery({
    queryKey: ["space_worksheets", selectedId, user?.id],
    enabled: !!user,
    queryFn: async (): Promise<WorksheetItem[]> => {
      const q = supabase
        .from("worksheets")
        .select("id,title,document_type,updated_at,session_id")
        .neq("document_type", "design")
        .eq("status", "saved")
        .order("updated_at", { ascending: false });
      const { data, error } = selectedId
        ? await q.eq("folder_id", selectedId)
        : await q.is("folder_id", null);
      if (error) throw error;
      return (data || []) as WorksheetItem[];
    },
  });

  // Folder mutations
  const handleCreate = async (parentId: string | null, name: string) => {
    if (!user) return;
    try {
      await createFolder(user.id, name, parentId);
      qc.invalidateQueries({ queryKey: ["space_folders"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to create folder");
    }
  };
  const handleRename = async (id: string, name: string) => {
    try {
      await renameFolder(id, name);
      qc.invalidateQueries({ queryKey: ["space_folders"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to rename");
    }
  };
  const handleDeleteFolder = async (id: string) => {
    try {
      await deleteFolder(id);
      qc.invalidateQueries({ queryKey: ["space_folders"] });
      qc.invalidateQueries({ queryKey: ["space_designs"] });
      qc.invalidateQueries({ queryKey: ["space_worksheets"] });
      if (selectedId === id) selectFolder(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    }
  };

  // New item actions
  const handleNewDocument = async () => {
    if (!user) return;
    try {
      // Create chat session + active worksheet and route into the chat with the worksheet panel open.
      const { data: ses, error: sesErr } = await supabase
        .from("chat_sessions")
        .insert({ user_id: user.id, title: "New worksheet" })
        .select("id")
        .single();
      if (sesErr || !ses) throw new Error(sesErr?.message || "Could not start session");
      const ws = await createWorksheet(user.id, "Untitled worksheet", "note", {
        session_id: ses.id,
        status: "active",
        folder_id: selectedId,
      });
      navigate(`/chat/${ses.id}?worksheet=${ws.id}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to create document");
    }
  };
  const handleNewDesign = () => {
    // Designs are created from chat. Send the user there.
    navigate("/chat");
  };

  // Breadcrumbs
  const crumbs = useMemo(() => {
    if (!selectedId) return [];
    const byId = new Map(folders.map((f) => [f.id, f]));
    const out: { id: string; name: string }[] = [];
    let cur = byId.get(selectedId);
    while (cur) {
      out.unshift({ id: cur.id, name: cur.name });
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return out;
  }, [selectedId, folders]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-muted/20">
      {/* Main pane */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-5">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
            <button
              className="inline-flex items-center gap-1 hover:text-foreground"
              onClick={() => selectFolder(null)}
            >
              <Home className="h-3.5 w-3.5" />
              <span>My Space</span>
            </button>
            {crumbs.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                <button onClick={() => selectFolder(c.id)} className="hover:text-foreground">
                  {c.name}
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center justify-between mb-5">
            <h1 className="text-2xl font-semibold">{selectedId ? crumbs[crumbs.length - 1]?.name : "My Space"}</h1>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  const name = window.prompt("Folder name", "New folder");
                  if (name && name.trim()) handleCreate(selectedId, name.trim());
                }}
              >
                <Folder className="h-3.5 w-3.5" /> New folder
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Create
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleNewDocument}>
                    <FileText className="h-4 w-4 mr-2" /> Document
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleNewDesign}>
                    <Sparkles className="h-4 w-4 mr-2" /> Design (in chat)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Subfolders */}
          {childFolders.length > 0 && (
            <section className="mb-6">
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Folders</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {childFolders.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => selectFolder(f.id)}
                    className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card hover:border-primary/40 transition-colors text-left"
                  >
                    <Folder className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium truncate">{f.name}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Designs */}
          <section className="mb-6">
            <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Designs</h2>
            {dLoading ? (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading designs…
              </div>
            ) : designs.length === 0 ? (
              <div className="text-xs text-muted-foreground">No designs in this folder.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {designs.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => {
                      navigate(`/chat/${d.session_id}?design=${d.id}`);
                    }}
                    className="text-left rounded-lg border border-border bg-card hover:border-primary/40 transition-colors overflow-hidden"
                  >
                    <div className="h-32 bg-white border-b border-border overflow-hidden relative">
                      <div
                        className="origin-top-left absolute inset-0 pointer-events-none"
                        style={{ transform: "scale(0.25)", width: "1280px", height: "640px" }}
                      >
                        <DesignPreview html={d.latestHtml} />
                      </div>
                    </div>
                    <div className="p-2">
                      <div className="text-sm font-medium truncate">{d.title}</div>
                      <div className="text-[11px] text-muted-foreground">
                        Updated {new Date(d.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Documents */}
          <section>
            <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Documents</h2>
            {wLoading ? (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading documents…
              </div>
            ) : worksheets.length === 0 ? (
              <div className="text-xs text-muted-foreground">No documents in this folder.</div>
            ) : (
              <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                {worksheets.map((w) => (
                  <li key={w.id}>
                    <Link
                      to={`/worksheet/${w.id}`}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-accent/40"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm flex-1 truncate">{w.title || "Untitled"}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(w.updated_at).toLocaleDateString()}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>

      {/* Right rail: collapsible folder tree */}
      <aside
        className={`hidden md:flex flex-col border-l border-border/60 bg-gradient-to-b from-card/60 to-background/40 backdrop-blur-sm transition-all duration-300 ease-in-out ${
          sideOpen ? "w-72" : "w-12"
        }`}
      >
        <div className="px-2 pt-3 pb-2 flex items-center justify-between">
          {sideOpen && (
            <div className="px-2">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80">
                Workspace
              </div>
              <div className="text-sm font-semibold mt-0.5">Folders</div>
            </div>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 rounded-full shrink-0"
            title={sideOpen ? "Collapse folders" : "Expand folders"}
            onClick={() => setSideOpen((o) => !o)}
          >
            {sideOpen ? (
              <ChevronRightIcon className="h-3.5 w-3.5" />
            ) : (
              <PanelRight className="h-3.5 w-3.5" />
            )}
          </Button>
          {sideOpen && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-full shrink-0"
              title="New folder at root"
              onClick={() => {
                const name = window.prompt("Folder name", "New folder");
                if (name && name.trim()) handleCreate(null, name.trim());
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {sideOpen && <div className="h-px mx-4 bg-border/60" />}
        <div className={`flex-1 overflow-y-auto px-2 py-2 ${sideOpen ? "" : "sr-only"}`}>
          {foldersLoading ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">Loading…</div>
          ) : (
            <FolderTree
              tree={tree}
              selectedId={selectedId}
              onSelect={selectFolder}
              onCreate={handleCreate}
              onRename={handleRename}
              onDelete={handleDeleteFolder}
            />
          )}
        </div>
      </aside>
    </div>
  );
};

export default SpacePage;