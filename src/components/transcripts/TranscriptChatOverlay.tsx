import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Send, Sparkles } from "lucide-react";
import { marked } from "marked";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SummarySection, Transcript } from "@/lib/transcripts";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcript-chat`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Pulls a ```summary fenced JSON block out of an assistant reply. */
function extractSummary(text: string): { clean: string; sections: SummarySection[] | null } {
  const match = text.match(/```summary\s*([\s\S]*?)```/i);
  if (!match) return { clean: text, sections: null };
  let sections: SummarySection[] | null = null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (Array.isArray(parsed)) sections = parsed as SummarySection[];
  } catch {
    /* leave the block visible if it is not valid JSON */
  }
  return { clean: sections ? text.replace(match[0], "").trim() : text, sections };
}

export default function TranscriptChatOverlay({
  transcript,
  summary,
  onSummaryUpdate,
}: {
  transcript: Transcript;
  summary: SummarySection[];
  onSummaryUpdate: (sections: SummarySection[]) => void | Promise<void>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fresh conversation whenever a different transcript is opened.
  useEffect(() => {
    setMessages([]);
    setInput("");
  }, [transcript.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    const history = [...messages, { role: "user" as const, content: text }];
    setMessages(history);
    setInput("");
    setStreaming(true);
    setCollapsed(false);

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: history,
          transcriptTitle: transcript.title,
          transcriptText:
            transcript.segments.length > 0
              ? transcript.segments.map((s) => `${s.speaker}: ${s.text}`).join("\n")
              : transcript.content_text,
          summarySections: summary,
        }),
      });

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error ?? "Request failed");
      }

      setMessages([...history, { role: "assistant", content: "" }]);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistant = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).replace(/\r$/, "");
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.error) throw new Error(payload.error);
            if (payload.content) {
              assistant += payload.content;
              const view = extractSummary(assistant);
              setMessages([...history, { role: "assistant", content: view.clean }]);
            }
          } catch (e) {
            if (e instanceof Error && e.message && !e.message.startsWith("Unexpected")) throw e;
          }
        }
      }

      const final = extractSummary(assistant);
      setMessages([...history, { role: "assistant", content: final.clean || "…" }]);
      if (final.sections && final.sections.length > 0) {
        await onSummaryUpdate(final.sections);
        toast.success("Summary updated");
      }
    } catch (e) {
      toast.error((e as Error).message);
      setMessages(history);
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div
      className={cn(
        "pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex flex-col",
        "border-t border-border/60 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/55",
        "shadow-[0_-8px_30px_-16px_hsl(var(--foreground)/0.35)] transition-[height] duration-200",
        collapsed ? "h-[56px]" : "h-1/4 min-h-[180px]",
      )}
    >
      <div className="flex items-center justify-between px-4 py-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          Ask Landi about this transcript
        </span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {!collapsed && (
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 pb-2">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Ask a question, or say “tighten the summary” / “add a next-steps section” to edit it.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/70 text-foreground",
                )}
              >
                {m.role === "assistant" ? (
                  <div
                    className="prose prose-sm max-w-none dark:prose-invert [&_p]:my-1"
                    dangerouslySetInnerHTML={{ __html: marked.parse(m.content || "…") as string }}
                  />
                ) : (
                  m.content
                )}
              </div>
            </div>
          ))}
          {streaming && messages[messages.length - 1]?.role === "user" && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="flex items-center gap-2 border-t border-border/50 px-4 py-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this meeting or refine the summary…"
          className="h-9 flex-1 rounded-full border border-border/60 bg-background/70 px-4 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-primary/50"
        />
        <Button type="submit" size="icon" className="h-9 w-9 rounded-full" disabled={streaming || !input.trim()}>
          {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
