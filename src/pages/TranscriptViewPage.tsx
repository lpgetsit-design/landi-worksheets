import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Transcript } from "@/lib/transcripts";
import { DEMO_TRANSCRIPTS } from "@/lib/transcriptDemo";
import TranscriptDetail from "@/components/transcripts/TranscriptDetail";

export default function TranscriptViewPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const demo = DEMO_TRANSCRIPTS.find((t) => t.id === id);
      if (demo) {
        setTranscript(demo);
        setLoading(false);
        return;
      }
      const { data, error } = await (supabase as any)
        .from("transcripts").select("*").eq("id", id).maybeSingle();
      if (cancelled) return;
      if (error) toast.error(error.message);
      setTranscript(
        data
          ? ({ ...data, participants: data.participants ?? [], segments: data.segments ?? [] } as Transcript)
          : null,
      );
      setLoading(false);
    };
    run();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!transcript) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">That transcript is not in your library.</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/transcripts")}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />Back to transcripts
        </Button>
      </main>
    );
  }

  return (
    <main className="relative mx-auto h-[calc(100vh-3.5rem)] w-full max-w-3xl">
      <TranscriptDetail transcript={transcript} />
    </main>
  );
}
