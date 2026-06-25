import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, Library as LibraryIcon, ExternalLink, Plus, Eye, Share2, Link2, MousePointerClick, Save, Undo2, Redo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import DesignPreview from "@/components/design/DesignPreview";
import DesignEditor, { type DesignEditorHandle, type DesignEditorState } from "@/components/design/DesignEditor";
import ShareDialog from "@/components/share/ShareDialog";

interface LibraryItem {
  designId: string;
  title: string;
  sessionId: string;
  sessionTitle: string;
  worksheetId: string | null;
  createdAt: string;
  updatedAt: string;
  latestHtml: string;
  visibleText: string;
  activeLinkCount: number;
  totalLinkCount: number;
  totalViews: number;
}

type SortKey = "newest" | "oldest" | "updated";

const stripHtml = (html: string): string =>
  (html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const LibraryPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [previewItem, setPreviewItem] = useState<LibraryItem | null>(null);
  const [cloning, setCloning] = useState<string | null>(null);
  const [shareItem, setShareItem] = useState<LibraryItem | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [savingEdits, setSavingEdits] = useState(false);
  const editorRef = useRef<DesignEditorHandle>(null);
  const [editorState, setEditorState] = useState<DesignEditorState>({ canUndo: false, canRedo: false });

  // Reset edit state whenever the preview target changes.
  useEffect(() => {
    setEditMode(false);
    setSavingEdits(false);
    setEditorState({ canUndo: false, canRedo: false });
  }, [previewItem?.designId]);

  const handleSavePreviewEdits = async () => {
    if (!previewItem || !editorRef.current) return;
    setSavingEdits(true);
    try {
      const html = await editorRef.current.getEditedHtml();
      // Compute next revision index for this design
      const { data: lastRev, error: rErr } = await supabase
        .from("chat_design_revisions")
        .select("revision_index")
        .eq("design_id", previewItem.designId)
        .order("revision_index", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (rErr) throw rErr;
      const nextIdx = (lastRev?.revision_index ?? -1) + 1;
      const { error: insErr } = await supabase.from("chat_design_revisions").insert([
        { design_id: previewItem.designId, revision_index: nextIdx, html, prompt_message_id: null },
      ]);
      if (insErr) throw insErr;
      await supabase
        .from("chat_designs")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", previewItem.designId);

      // Update local state
      const updatedItem: LibraryItem = {
        ...previewItem,
        latestHtml: html,
        visibleText: stripHtml(html),
        updatedAt: new Date().toISOString(),
      };
      setItems((prev) => prev.map((p) => (p.designId === previewItem.designId ? updatedItem : p)));
      setPreviewItem(updatedItem);
      setEditMode(false);
      toast.success("Edits saved as a new revision");
    } catch (e) {
      console.error(e);
      toast.error("Could not save edits");
    } finally {
      setSavingEdits(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("chat_designs")
        .select(
          "id,title,created_at,updated_at,session_id,chat_sessions(title,worksheet_id),chat_design_revisions(id,revision_index,html)",
        )
        .eq("status", "saved")
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        toast.error("Failed to load library");
        setLoading(false);
        return;
      }
      const mapped: LibraryItem[] = ((data as any[]) || [])
        .map((d) => {
          const revs = (d.chat_design_revisions || []) as any[];
          if (revs.length === 0) return null;
          const latest = revs.reduce((a, b) =>
            (b.revision_index ?? 0) > (a.revision_index ?? 0) ? b : a,
          );
          return {
            designId: d.id,
            title: d.title || "Untitled design",
            sessionId: d.session_id,
            sessionTitle: d.chat_sessions?.title || "Chat",
            worksheetId: d.chat_sessions?.worksheet_id ?? null,
            createdAt: d.created_at,
            updatedAt: d.updated_at,
            latestHtml: latest.html || "",
            visibleText: stripHtml(latest.html || ""),
            activeLinkCount: 0,
            totalLinkCount: 0,
            totalViews: 0,
          } as LibraryItem;
        })
        .filter(Boolean) as LibraryItem[];

      // Fetch share stats per design
      const ids = mapped.map((m) => m.designId);
      if (ids.length > 0) {
        const { data: links, error: lErr } = await supabase
          .from("public_share_links")
          .select("id,chat_design_id,is_active,share_link_views(count)")
          .in("chat_design_id", ids);
        if (!lErr && links) {
          const statsByDesign = new Map<
            string,
            { active: number; total: number; views: number }
          >();
          for (const row of links as any[]) {
            const did = row.chat_design_id as string;
            const s = statsByDesign.get(did) || { active: 0, total: 0, views: 0 };
            s.total += 1;
            if (row.is_active) s.active += 1;
            const v = Array.isArray(row.share_link_views)
              ? row.share_link_views[0]?.count ?? 0
              : 0;
            s.views += Number(v) || 0;
            statsByDesign.set(did, s);
          }
          for (const item of mapped) {
            const s = statsByDesign.get(item.designId);
            if (s) {
              item.activeLinkCount = s.active;
              item.totalLinkCount = s.total;
              item.totalViews = s.views;
            }
          }
        }
      }
      setItems(mapped);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? items.filter(
          (i) =>
            i.title.toLowerCase().includes(q) ||
            i.visibleText.toLowerCase().includes(q),
        )
      : items.slice();
    list.sort((a, b) => {
      if (sort === "oldest") return a.createdAt.localeCompare(b.createdAt);
      if (sort === "updated") return b.updatedAt.localeCompare(a.updatedAt);
      return b.createdAt.localeCompare(a.createdAt);
    });
    return list;
  }, [items, query, sort]);

  const handleResume = (item: LibraryItem) => {
    navigate(`/chat/${item.sessionId}?design=${item.designId}`);
  };

  const handleCloneToNewChat = async (item: LibraryItem) => {
    if (!user) return;
    setCloning(item.designId);
    try {
      const { data: session, error: sErr } = await supabase
        .from("chat_sessions")
        .insert([{ user_id: user.id, title: `Continued: ${item.title}` }])
        .select()
        .single();
      if (sErr || !session) throw sErr || new Error("session insert failed");

      const { data: design, error: dErr } = await supabase
        .from("chat_designs")
        .insert([{ session_id: session.id, title: item.title, status: "active" }])
        .select()
        .single();
      if (dErr || !design) throw dErr || new Error("design insert failed");

      const { error: rErr } = await supabase.from("chat_design_revisions").insert([
        {
          design_id: design.id,
          revision_index: 0,
          html: item.latestHtml,
          prompt_message_id: null,
        },
      ]);
      if (rErr) throw rErr;

      navigate(`/chat/${session.id}`);
    } catch (e) {
      console.error(e);
      toast.error("Could not start a new chat with this design");
    } finally {
      setCloning(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-5 flex items-center gap-2">
        <LibraryIcon className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Library</h1>
        <span className="text-xs text-muted-foreground ml-1">
          Saved designs from your chats
        </span>
      </header>

      <div className="mb-4 flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or visible text…"
            className="pl-8"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="updated">Recently updated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading library…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20 text-muted-foreground">
          <LibraryIcon className="h-10 w-10 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">
            {items.length === 0 ? "No saved designs yet" : "No matches"}
          </p>
          <p className="text-xs max-w-sm">
            {items.length === 0
              ? "When you click Save on a design in AskLandi, it will appear here."
              : "Try a different search term or clear the filter."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((item) => (
            <li
              key={item.designId}
              className="border border-border rounded-lg p-3 bg-card hover:border-primary/40 transition-colors"
            >
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setPreviewItem(item)}
                  className="w-32 h-24 shrink-0 rounded-md overflow-hidden border border-border bg-white relative group"
                  title="Preview"
                >
                  <div className="absolute inset-0 pointer-events-none">
                    <div
                      className="origin-top-left"
                      style={{
                        transform: "scale(0.18)",
                        width: "720px",
                        height: "560px",
                      }}
                    >
                      <DesignPreview html={item.latestHtml} />
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <Eye className="h-4 w-4 text-white" />
                  </div>
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{item.title}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Updated {new Date(item.updatedAt).toLocaleString()} · from “
                        {item.sessionTitle}”
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                        {item.visibleText || "(no text content)"}
                      </p>
                      {item.totalLinkCount > 0 && (
                        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Link2 className="h-3 w-3" />
                            {item.activeLinkCount} active
                            {item.totalLinkCount !== item.activeLinkCount && (
                              <span className="text-muted-foreground/70">
                                {" "}
                                / {item.totalLinkCount} total
                              </span>
                            )}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {item.totalViews} view{item.totalViews === 1 ? "" : "s"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => handleResume(item)}
                    >
                      <ExternalLink className="h-3 w-3" /> Resume chat
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => handleCloneToNewChat(item)}
                      disabled={cloning === item.designId}
                    >
                      {cloning === item.designId ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plus className="h-3 w-3" />
                      )}
                      New chat with this design
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => setShareItem(item)}
                    >
                      <Share2 className="h-3 w-3" /> Share
                    </Button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!previewItem} onOpenChange={(v) => !v && setPreviewItem(null)}>
        <DialogContent className="max-w-5xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{previewItem?.title}</DialogTitle>
          </DialogHeader>
          {previewItem && (
            <div className="flex flex-wrap gap-2 -mt-1">
              {editMode ? (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => editorRef.current?.undo()}
                    disabled={!editorState.canUndo || savingEdits}
                    title="Undo (Ctrl/Cmd+Z)"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => editorRef.current?.redo()}
                    disabled={!editorState.canRedo || savingEdits}
                    title="Redo (Ctrl/Cmd+Shift+Z)"
                  >
                    <Redo2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={handleSavePreviewEdits}
                    disabled={savingEdits}
                  >
                    {savingEdits ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Save className="h-3 w-3" />
                    )}
                    Save edits
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setEditMode(false)}
                    disabled={savingEdits}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => setEditMode(true)}
                >
                  <MousePointerClick className="h-3 w-3" /> Edit
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => {
                  const it = previewItem;
                  setPreviewItem(null);
                  handleResume(it);
                }}
                disabled={editMode}
              >
                <ExternalLink className="h-3 w-3" /> Resume chat
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => {
                  const it = previewItem;
                  setPreviewItem(null);
                  handleCloneToNewChat(it);
                }}
                disabled={editMode || cloning === previewItem.designId}
              >
                {cloning === previewItem.designId ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
                New chat with this design
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => setShareItem(previewItem)}
                disabled={editMode}
              >
                <Share2 className="h-3 w-3" /> Share
              </Button>
            </div>
          )}
          <div className="flex-1 min-h-0">
            {previewItem && (
              editMode ? (
                <DesignEditor
                  ref={editorRef}
                  html={previewItem.latestHtml}
                  editMode={editMode}
                  onStateChange={setEditorState}
                />
              ) : (
                <DesignPreview html={previewItem.latestHtml} />
              )
            )}
          </div>
          {editMode && (
            <div className="text-[11px] text-muted-foreground -mt-1">
              Click text to edit. Click any block to select, then use the toolbar to duplicate, delete, or reorder. Drag to move blocks anywhere — including into other containers.
            </div>
          )}
        </DialogContent>
      </Dialog>

      {shareItem && (
        <ShareDialog
          open={!!shareItem}
          onOpenChange={(v) => !v && setShareItem(null)}
          chatDesignId={shareItem.designId}
          worksheetTitle={shareItem.title}
        />
      )}
    </div>
  );
};

export default LibraryPage;