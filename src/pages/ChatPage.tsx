import { useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import AskLandiChat, { type ArtifactRef } from "@/components/chat/AskLandiChat";

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

  // Resolve `?design=<id>` or `?worksheet=<id>` once into an initial artifact ref,
  // then strip the param to avoid re-triggering on later renders.
  const initialArtifact = useMemo<ArtifactRef | null>(() => {
    const d = searchParams.get("design");
    if (d) return { kind: "design", id: d };
    const w = searchParams.get("worksheet");
    if (w) return { kind: "worksheet", id: w };
    return null;
  }, [searchParams]);

  useEffect(() => {
    if (!searchParams.get("design") && !searchParams.get("worksheet")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("design");
    next.delete("worksheet");
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
        initialArtifact={initialArtifact}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
      />
    </div>
  );
};

export default ChatPage;