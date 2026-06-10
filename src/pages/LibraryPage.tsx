import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, Library as LibraryIcon, ExternalLink, Plus, Eye } from "lucide-react";
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

interface LibraryItem {
  designId: string;
  title: string;
  sessionId: string;
  sessionTitle: string;
  createdAt: string;
  updatedAt: string;
  latestHtml: string;
  visibleText: string;
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

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("chat_designs")
        .select(
          "id,title,created_at,updated_at,session_id,chat_sessions(title),chat_design_revisions(id,revision_index,html)",
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
            createdAt: d.created_at,
            updatedAt: d.updated_at,
            latestHtml: latest.html || "",
            visibleText: stripHtml(latest.html || ""),
          } as LibraryItem;
        })
        .filter(Boolean) as LibraryItem[];
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
          <div className="flex-1 min-h-0">
            {previewItem && <DesignPreview html={previewItem.latestHtml} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LibraryPage;