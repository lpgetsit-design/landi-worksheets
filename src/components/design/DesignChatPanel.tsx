import { useState, useRef, useCallback, useEffect } from "react";
import { X, Send, RotateCcw, Wrench, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { marked } from "marked";


interface ToolCall {
  id: string;
  function: { name: string; arguments: string };
}

interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface DesignChatPanelProps {
  open: boolean;
  onClose: () => void;
  worksheetId: string;
  worksheetTitle: string;
  currentHtml: string;
  onHtmlChange: (html: string) => void;
  onUpdateTitle?: (title: string) => void;
}

const DESIGN_CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/design-chat`;

const toolLabels: Record<string, string> = {
  replace_design_html: "Built webpage",
  update_worksheet_title: "Changed title",
  search_bullhorn: "Searched CRM",
  get_candidate_profile: "Loaded candidate",
  get_job_details: "Loaded job details",
  search_candidates: "Searched candidates",
  search_jobs: "Searched jobs",
  tavily_search: "Searched the web",
  tavily_extract: "Extracted web content",
  tavily_crawl: "Crawled website",
  tavily_research: "Completed deep research",
};

const CopyButton = ({ content }: { content: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      const html = marked.parse(content, { async: false }) as string;
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([content], { type: "text/plain" }),
        }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [content]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="absolute -bottom-1 right-0 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
      onClick={handleCopy}
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3 w-3 text-muted-foreground" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
    </Button>
  );
};

const DesignChatPanel = ({
  open,
  onClose,
  worksheetId,
  worksheetTitle,
  currentHtml,
  onHtmlChange,
  onUpdateTitle,
}: DesignChatPanelProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentHtmlRef = useRef(currentHtml);

  useEffect(() => {
    currentHtmlRef.current = currentHtml;
  }, [currentHtml]);

  const scrollToBottom = () => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const executeTool = async (name: string, args: string): Promise<string> => {
    try {
      const parsed = JSON.parse(args);
      switch (name) {
        case "replace_design_html":
          onHtmlChange(parsed.html);
          // Save design HTML in meta.design_html to avoid TipTap overwriting content_html
          try {
            const { supabase } = await import("@/integrations/supabase/client");
            const { data: current } = await supabase
              .from("worksheets")
              .select("meta")
              .eq("id", worksheetId)
              .single();
            const existingMeta = (current?.meta as Record<string, any>) || {};
            await supabase
              .from("worksheets")
              .update({ meta: { ...existingMeta, design_html: parsed.html } })
              .eq("id", worksheetId);
          } catch (e) {
            console.error("Failed to save design HTML:", e);
          }
          return "Webpage updated successfully.";
        case "update_worksheet_title":
          onUpdateTitle?.(parsed.title);
          return `Title changed to "${parsed.title}".`;
        default:
          return `Unknown tool: ${name}`;
      }
    } catch (e) {
      return `Tool error: ${e instanceof Error ? e.message : "Unknown error"}`;
    }
  };

  const streamChat = async (conversationMessages: Message[]): Promise<Message | null> => {
    const apiMessages = conversationMessages.map((m) => {
      const base: any = { role: m.role, content: m.content };
      if (m.tool_calls) base.tool_calls = m.tool_calls;
      if (m.tool_call_id) {
        base.tool_call_id = m.tool_call_id;
        base.name = m.name;
      }
      return base;
    });

    const resp = await fetch(DESIGN_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        messages: apiMessages,
        worksheetTitle: worksheetTitle || "",
        currentHtml: currentHtmlRef.current || "",
      }),
      signal: abortRef.current?.signal,
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "Request failed" }));
      toast.error(err.error || "AI request failed");
      setThinkingLabel(null);
      setStreamingContent("");
      return null;
    }

    const reader = resp.body?.getReader();
    if (!reader) {
      toast.error("Failed to read response stream");
      setThinkingLabel(null);
      setStreamingContent("");
      return null;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let finalMessage: any = null;
    let streamedText = "";
    let currentEventType = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // Keep the last element — it may be an incomplete line split across chunks
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith(":") || line === "") continue;
        if (line.startsWith("event: ")) {
          currentEventType = line.slice(7).trim();
          continue;
        }
        if (line.startsWith("data: ")) {
          const currentData = line.slice(6);
          try {
            const parsed = JSON.parse(currentData);
            switch (currentEventType) {
              case "status":
                setThinkingLabel(parsed.message);
                if (parsed.phase === "thinking") {
                  streamedText = "";
                  setStreamingContent("");
                }
                scrollToBottom();
                break;
              case "token":
                streamedText += parsed.content;
                setStreamingContent(streamedText);
                setThinkingLabel(null);
                scrollToBottom();
                break;
              case "tool_calls":
                setThinkingLabel(parsed.message);
                streamedText = "";
                setStreamingContent("");
                scrollToBottom();
                break;
              case "done":
                finalMessage = parsed.message;
                setThinkingLabel(null);
                setStreamingContent("");
                break;
              case "error":
                toast.error(parsed.error || "AI request failed");
                setThinkingLabel(null);
                setStreamingContent("");
                return null;
            }
            // Only reset event type after successful parse
            currentEventType = "";
          } catch {
            // JSON parse failed — incomplete line, put it back with its event context
            buffer = `event: ${currentEventType}\n${line}\n` + buffer;
            currentEventType = "";
          }
        }
      }
    }

    if (!finalMessage) return null;

    const msg: any = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: finalMessage.content || "",
      tool_calls: finalMessage.tool_calls,
    };
    if (finalMessage._server_tool_results) {
      msg._server_tool_results = finalMessage._server_tool_results;
    }
    return msg;
  };

  const handleSend = async (directText?: string) => {
    const text = (directText ?? input).trim();
    if (!text || isLoading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
    let allMessages = [...messages, userMsg];
    setMessages(allMessages);
    if (!directText) setInput("");
    setIsLoading(true);
    setThinkingLabel("Connecting...");
    setStreamingContent("");
    scrollToBottom();

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      for (let clientLoop = 0; clientLoop < 5; clientLoop++) {
        const assistantMsg = await streamChat(allMessages);
        if (!assistantMsg) break;

        allMessages = [...allMessages, assistantMsg];
        setMessages(allMessages);
        scrollToBottom();

        if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
          const toolResultMessages: Message[] = [];

          // Add server-side tool results that were already executed
          const serverResults = (assistantMsg as any)._server_tool_results as Array<{ tool_call_id: string; name: string; content: string }> | undefined;
          const serverResultIds = new Set((serverResults || []).map(r => r.tool_call_id));

          if (serverResults) {
            for (const sr of serverResults) {
              toolResultMessages.push({
                id: crypto.randomUUID(),
                role: "tool",
                content: sr.content,
                tool_call_id: sr.tool_call_id,
                name: sr.name,
              });
            }
          }

          // Execute client-side tools
          for (const tc of assistantMsg.tool_calls) {
            if (serverResultIds.has(tc.id)) continue; // already handled server-side
            const result = await executeTool(tc.function.name, tc.function.arguments);
            toolResultMessages.push({
              id: crypto.randomUUID(),
              role: "tool" as const,
              content: result,
              tool_call_id: tc.id,
              name: tc.function.name,
            });
          }

          allMessages = [...allMessages, ...toolResultMessages];
          setMessages(allMessages);
          scrollToBottom();
          continue;
        }
        break;
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error("Chat error:", e);
        toast.error("Failed to get AI response");
      }
    } finally {
      setIsLoading(false);
      setThinkingLabel(null);
      setStreamingContent("");
      abortRef.current = null;
    }
  };

  if (!open) return null;

  return (
    <div className="flex h-full w-full flex-col border-l border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-medium text-foreground">Design Assistant</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              abortRef.current?.abort();
              setMessages([]);
              setInput("");
              setIsLoading(false);
              setThinkingLabel(null);
              setStreamingContent("");
            }}
            title="Reset conversation"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !streamingContent && !thinkingLabel ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-sm text-muted-foreground">
              Describe the webpage you want to build
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => {
              if (msg.role === "tool") {
                return (
                  <div key={msg.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Wrench className="h-3 w-3" />
                    <span>{toolLabels[msg.name || ""] || msg.name}: {msg.content}</span>
                  </div>
                );
              }

              if (msg.role === "assistant" && msg.tool_calls && !msg.content) {
                return (
                  <div key={msg.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Wrench className="h-3 w-3" />
                    <span>Building webpage...</span>
                  </div>
                );
              }

              if (msg.role === "assistant" && !msg.content && !msg.tool_calls) return null;

              return (
                <div key={msg.id} className="group relative">
                  <div
                    className={cn(
                      "rounded-md px-3 py-2 text-sm",
                      msg.role === "user"
                        ? "ml-6 bg-primary text-primary-foreground"
                        : "mr-6 bg-muted text-foreground"
                    )}
                  >
                    {msg.role === "assistant" ? (
                      <div
                        className="prose prose-sm dark:prose-invert max-w-none"
                        dangerouslySetInnerHTML={{
                          __html: marked.parse(msg.content || "...", { async: false }) as string,
                        }}
                      />
                    ) : (
                      msg.content
                    )}
                  </div>
                  {msg.role === "assistant" && msg.content && (
                    <CopyButton content={msg.content} />
                  )}
                </div>
              );
            })}

            {streamingContent && (
              <div className="group relative">
                <div className="mr-6 rounded-md bg-muted px-3 py-2 text-sm text-foreground">
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: marked.parse(streamingContent, { async: false }) as string,
                    }}
                  />
                </div>
              </div>
            )}

            {thinkingLabel && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
                <div className="h-3 w-3 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
                <span>{thinkingLabel}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Describe your webpage..."
            disabled={isLoading}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          />
          <Button size="icon" className="h-9 w-9" onClick={() => handleSend()} disabled={isLoading}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DesignChatPanel;
