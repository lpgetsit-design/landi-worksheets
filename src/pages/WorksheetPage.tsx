import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { ensureActiveWorksheet } from "@/lib/worksheetArtifacts";

/**
 * Legacy standalone worksheet route.
 * - For the owner: redirect into the chat session that owns the worksheet, with the worksheet artifact panel opened.
 * - For non-owners (granted access): render a read-only HTML view.
 */
const WorksheetPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [readOnly, setReadOnly] = useState<{ title: string; html: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase
        .from("worksheets")
        .select("id,user_id,session_id,title,content_html")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) {
        setError("Worksheet not found");
        return;
      }
      // Owner → bounce into chat session.
      if (user && data.user_id === user.id) {
        let sessionId = data.session_id;
        if (!sessionId) {
          // Legacy worksheet without a session — create one and attach.
          const { data: ses } = await supabase
            .from("chat_sessions")
            .insert({ user_id: user.id, title: data.title || "Worksheet" })
            .select("id")
            .single();
          sessionId = ses?.id || null;
          if (sessionId) {
            await supabase.from("worksheets").update({ session_id: sessionId, status: "active" }).eq("id", id);
            await ensureActiveWorksheet(sessionId, user.id, data.title || "Worksheet").catch(() => {});
          }
        }
        if (sessionId) {
          navigate(`/chat/${sessionId}?worksheet=${id}`, { replace: true });
          return;
        }
      }
      // Non-owner → read-only view (assumes they reached via a granted share/access path).
      setReadOnly({ title: data.title || "Worksheet", html: data.content_html || "" });
    })();
  }, [id, user, navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  if (!readOnly) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading worksheet…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card px-4 py-2 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Button>
        <span className="text-sm font-medium truncate">{readOnly.title}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">Read-only</span>
      </div>
      <article
        className="prose prose-sm dark:prose-invert max-w-3xl mx-auto px-6 py-10"
        dangerouslySetInnerHTML={{ __html: readOnly.html }}
      />
    </div>
  );
};

export default WorksheetPage;