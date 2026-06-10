import { useCallback, useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import AskLandiChat from "@/components/chat/AskLandiChat";

const ChatPage = () => {
  const { sessionId: routeSessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Bootstrap: create a global session and redirect.
  const bootstrappingRef = useRef(false);
  useEffect(() => {
    if (routeSessionId || !user || bootstrappingRef.current) return;
    bootstrappingRef.current = true;
    (async () => {
      const { data, error } = await supabase
        .from("chat_sessions")
        .insert([{ user_id: user.id, title: "New chat" }])
        .select()
        .single();
      if (error || !data) {
        toast.error("Could not start a new chat");
        return;
      }
      navigate(`/chat/${data.id}`, { replace: true });
    })();
  }, [routeSessionId, user, navigate]);

  const handleNewChat = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("chat_sessions")
      .insert([{ user_id: user.id, title: "New chat" }])
      .select()
      .single();
    if (error || !data) {
      toast.error("Could not start a new chat");
      return;
    }
    navigate(`/chat/${data.id}`);
  }, [user, navigate]);

  const handleSelectSession = useCallback(
    (id: string) => {
      navigate(`/chat/${id}`);
    },
    [navigate],
  );

  // Honor ?design=<id> deep links — pass through unchanged for now; AskLandiChat
  // will reopen the design once it loads. We strip it after one tick.
  useEffect(() => {
    if (!searchParams.get("design")) return;
    // The deep-link feature was previously handled inline; leave the param so
    // AskLandiChat can still see it via window.location if needed, but clean it
    // up to avoid re-triggering.
    const next = new URLSearchParams(searchParams);
    next.delete("design");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  if (!routeSessionId) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Starting chat…
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-3.5rem)]">
      <AskLandiChat
        key={routeSessionId}
        sessionId={routeSessionId}
        userId={user?.id}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
      />
    </div>
  );
};

export default ChatPage;