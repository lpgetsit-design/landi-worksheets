import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { marked } from "marked";
import WorksheetMentionInput, { type WorksheetMention } from "@/components/chat/WorksheetMentionInput";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  mentions?: WorksheetMention[];
}

const GENERAL_CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/general-chat`;

const ChatPage = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [thinking, setThinking] = useState<string | null>(null);
  const [streaming, setStreaming] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streaming, thinking, scrollToBottom]);

  const handleSend = useCallback(
    async (text: string, mentions: WorksheetMention[]) => {
      const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text, mentions };
      const conversation = [...messages, userMsg];
      setMessages(conversation);
      setIsLoading(true);
      setThinking("Thinking…");
      setStreaming("");

      // Build full mention pool (sticky across turns)
      const allMentions = new Map<string, WorksheetMention>();
      for (const m of conversation) {
        for (const x of m.mentions || []) allMentions.set(x.worksheetId, x);
      }

      const apiMessages = conversation.map((m) => ({ role: m.role, content: m.content }));

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const resp = await fetch(GENERAL_CHAT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: apiMessages,
            referencedWorksheets: Array.from(allMentions.values()),
          }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: "Request failed" }));
          toast.error(err.error || "AI request failed");
          return;
        }

        const reader = resp.body?.getReader();
        if (!reader) {
          toast.error("Failed to read response stream");
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "";
        let streamed = "";
        let finalContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith(":") || line === "") continue;
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
              continue;
            }
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              try {
                const parsed = JSON.parse(data);
                switch (currentEvent) {
                  case "status":
                    setThinking(parsed.message);
                    break;
                  case "token":
                    streamed += parsed.content;
                    setStreaming(streamed);
                    setThinking(null);
                    break;
                  case "done":
                    finalContent = parsed.message?.content || streamed;
                    setThinking(null);
                    setStreaming("");
                    break;
                  case "error":
                    toast.error(parsed.error || "AI error");
                    setThinking(null);
                    setStreaming("");
                    return;
                }
                currentEvent = "";
              } catch {
                buffer = `event: ${currentEvent}\n${line}\n` + buffer;
                currentEvent = "";
              }
            }
          }
        }

        if (finalContent) {
          setMessages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), role: "assistant", content: finalContent },
          ]);
        }
      } catch (e: any) {
        if (e.name !== "AbortError") {
          console.error("Chat error:", e);
          toast.error("Failed to get AI response");
        }
      } finally {
        setIsLoading(false);
        setThinking(null);
        setStreaming("");
        abortRef.current = null;
      }
    },
    [messages],
  );

  const reset = () => {
    abortRef.current?.abort();
    setMessages([]);
    setStreaming("");
    setThinking(null);
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="border-b border-border px-4 py-2 flex items-center justify-between">
        <div className="mx-auto max-w-3xl w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Chat</span>
          </div>
          <Button variant="ghost" size="sm" onClick={reset} className="h-7 gap-1.5 text-xs">
            <RotateCcw className="h-3 w-3" /> New chat
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {messages.length === 0 && !streaming && !thinking ? (
            <div className="flex flex-col items-center justify-center text-center py-24">
              <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-foreground font-medium mb-1">Ask anything</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Type your question. Use <code className="px-1 py-0.5 bg-muted rounded text-[11px]">@</code> to
                reference one of your worksheets as context.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((m) => (
                <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
                  {m.role === "user" ? (
                    <div className="max-w-[85%] rounded-2xl bg-primary text-primary-foreground px-4 py-2 text-sm whitespace-pre-wrap">
                      {m.content}
                      {m.mentions && m.mentions.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {m.mentions.map((x) => (
                            <span
                              key={x.worksheetId}
                              className="inline-flex items-center gap-1 rounded-full bg-primary-foreground/20 px-2 py-0.5 text-[10px]"
                            >
                              📄 {x.title}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none text-foreground"
                      dangerouslySetInnerHTML={{
                        __html: marked.parse(m.content, { async: false }) as string,
                      }}
                    />
                  )}
                </div>
              ))}

              {streaming && (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none text-foreground"
                  dangerouslySetInnerHTML={{
                    __html: marked.parse(streaming, { async: false }) as string,
                  }}
                />
              )}

              {thinking && (
                <div className="text-xs text-muted-foreground italic animate-pulse">
                  {thinking}
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>

      <WorksheetMentionInput onSend={handleSend} isLoading={isLoading} />
    </div>
  );
};

export default ChatPage;