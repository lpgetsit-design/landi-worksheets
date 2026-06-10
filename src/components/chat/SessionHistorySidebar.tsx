import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MessageSquare, Plus, PanelLeftClose, PanelLeftOpen, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface SessionRow {
  id: string;
  title: string;
  updated_at: string;
}

interface Props {
  userId: string | undefined;
  activeSessionId: string;
  /** Bumped by parent whenever the current session changes (new msg, new title) so we refetch. */
  refreshKey?: number;
  onNewChat: () => void;
  /** When set, only sessions tied to this worksheet are shown. When omitted, only sessions with no worksheet (global /chat) are shown. */
  worksheetId?: string | null;
  /** Called when the user picks a session from the list. Parent decides whether to navigate or swap state. */
  onSelectSession?: (sessionId: string) => void;
}

const SessionHistorySidebar = ({ userId, activeSessionId, refreshKey, onNewChat, worksheetId, onSelectSession }: Props) => {
  const [open, setOpen] = useState(true);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase
        .from("chat_sessions")
        .select("id,title,updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (worksheetId) {
        q = q.eq("worksheet_id", worksheetId);
      } else {
        q = q.is("worksheet_id", null);
      }
      const { data, error } = await q;
      if (cancelled) return;
      if (error) {
        toast.error("Failed to load chat history");
      } else {
        setSessions((data || []) as SessionRow[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey, activeSessionId, worksheetId]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this chat? This cannot be undone.")) return;
    const { error } = await supabase.from("chat_sessions").delete().eq("id", id);
    if (error) {
      toast.error("Could not delete chat");
      return;
    }
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (id === activeSessionId) {
      onNewChat();
    }
  };

  const pick = (id: string) => {
    if (onSelectSession) onSelectSession(id);
    else window.location.assign(`/chat/${id}`);
  };

  if (!open) {
    return (
      <div className="border-r border-border bg-muted/30 flex flex-col items-center py-2 w-10 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setOpen(true)}
          title="Show chat history"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="border-r border-border bg-muted/30 flex flex-col w-56 shrink-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">History</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setOpen(false)}
          title="Hide history"
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="p-2">
        <Button variant="outline" size="sm" className="w-full h-8 gap-1.5 text-xs" onClick={onNewChat}>
          <Plus className="h-3.5 w-3.5" /> New chat
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
        {loading && sessions.length === 0 ? (
          <div className="text-xs text-muted-foreground px-2 py-4">Loading…</div>
        ) : sessions.length === 0 ? (
          <div className="text-xs text-muted-foreground px-2 py-4">No chats yet</div>
        ) : (
          sessions.map((s) => {
            const isActive = s.id === activeSessionId;
            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => pick(s.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") pick(s.id);
                }}
                className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs cursor-pointer ${
                  isActive ? "bg-primary/10 text-foreground" : "hover:bg-accent text-muted-foreground"
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{s.title || "New chat"}</div>
                  <div className="text-[10px] text-muted-foreground/70">
                    {new Date(s.updated_at).toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => handleDelete(s.id, e)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  title="Delete chat"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default SessionHistorySidebar;