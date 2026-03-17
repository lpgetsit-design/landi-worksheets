import { useState, useRef, useCallback } from "react";
import { X, Send, RotateCcw, Wrench, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { marked } from "marked";
import CrmChatContent from "./CrmChatContent";
import type { DocumentType } from "@/lib/worksheets";

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

interface AIChatPanelProps {
  open: boolean;
  onClose: () => void;
  selectedText?: string;
  worksheetContent?: string;
  worksheetTitle?: string;
  worksheetType?: DocumentType;
  onApplyEdit?: (content: string) => void;
  onUpdateTitle?: (title: string) => void;
  onUpdateDocumentType?: (type: DocumentType) => void;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

const toolLabels: Record<string, string> = {
  replace_worksheet_content: "Updated worksheet content",
  update_worksheet_title: "Changed title",
  update_document_type: "Changed document type",
  lookup_bullhorn_entity: "Looked up CRM entity",
  batch_resolve_entities: "Resolved CRM entities",
  search_bullhorn_candidates: "Searched candidates",
  get_bullhorn_candidate_profile: "Retrieved candidate profile",
  search_bullhorn_jobs: "Searched jobs",
  get_bullhorn_job_summary: "Retrieved job details",
  search_bullhorn_placements: "Searched placements",
  get_bullhorn_placement_summary: "Retrieved placement details",
};

/** Copies AI markdown as rich HTML to clipboard for pasting into the worksheet editor */
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

const AIChatPanel = ({
  open,
  onClose,
  selectedText,
  worksheetContent,
  worksheetTitle,
  worksheetType,
  onApplyEdit,
  onUpdateTitle,
  onUpdateDocumentType,
}: AIChatPanelProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const executeTool = (name: string, args: string): string => {
    try {
      const parsed = JSON.parse(args);
      switch (name) {
        case "replace_worksheet_content":
          onApplyEdit?.(parsed.content);
          return "Worksheet content updated successfully.";
        case "update_worksheet_title":
          onUpdateTitle?.(parsed.title);
          return `Title changed to "${parsed.title}".`;
        case "update_document_type":
          onUpdateDocumentType?.(parsed.document_type as DocumentType);
          return `Document type changed to "${parsed.document_type}".`;
        default:
          return `Unknown tool: ${name}`;
      }
    } catch (e) {
      return `Tool error: ${e instanceof Error ? e.message : "Unknown error"}`;
    }
  };

  /** Parse SSE stream with token-by-token streaming. Returns the final assistant message. */
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

    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        messages: apiMessages,
        worksheetTitle: worksheetTitle || "",
        worksheetContent: worksheetContent || "",
        worksheetType: worksheetType || "note",
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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = "";

      let currentEventType = "";

      for (const line of lines) {
        if (line.startsWith(":")) continue;
        if (line.startsWith("event: ")) {
          currentEventType = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const currentData = line.slice(6);
          try {
            const parsed = JSON.parse(currentData);

            switch (currentEventType) {
              case "status":
                setThinkingLabel(parsed.message);
                // Clear streaming content when entering a new thinking phase
                if (parsed.phase === "thinking") {
                  streamedText = "";
                  setStreamingContent("");
                }
                scrollToBottom();
                break;
              case "token":
                // Append streamed token content
                streamedText += parsed.content;
                setStreamingContent(streamedText);
                setThinkingLabel(null); // hide thinking label while tokens arrive
                scrollToBottom();
                break;
              case "tool_calls":
                setThinkingLabel(parsed.message);
                // Clear streaming since AI is now calling tools
                streamedText = "";
                setStreamingContent("");
                scrollToBottom();
                break;
              case "tool_result": {
                const label = toolLabels[parsed.tool] || parsed.tool;
                setThinkingLabel(`✓ ${label}`);
                scrollToBottom();
                break;
              }
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
          } catch {
            buffer += line + "\n";
          }
          currentEventType = "";
        } else if (line === "") {
          // empty line between events
        } else {
          buffer += line + "\n";
        }
      }
    }

    if (!finalMessage) return null;

    return {
      id: crypto.randomUUID(),
      role: "assistant",
      content: finalMessage.content || "",
      tool_calls: finalMessage.tool_calls,
    };
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
    let allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput("");
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
          const toolNames = assistantMsg.tool_calls
            .map((tc) => toolLabels[tc.function.name] || tc.function.name)
            .join(", ");
          setThinkingLabel(`Running: ${toolNames}`);
          scrollToBottom();

          const toolResultMessages: Message[] = assistantMsg.tool_calls.map((tc) => {
            const result = executeTool(tc.function.name, tc.function.arguments);
            return {
              id: crypto.randomUUID(),
              role: "tool" as const,
              content: result,
              tool_call_id: tc.id,
              name: tc.function.name,
            };
          });

          allMessages = [...allMessages, ...toolResultMessages];
          setMessages(allMessages);
          scrollToBottom();

          setThinkingLabel("Reviewing changes...");
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
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-medium text-foreground">AI Assistant</span>
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

      {/* Selected Text Context */}
      {selectedText && (
        <div className="border-b border-border px-4 py-2">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Selected text
          </p>
          <p className="line-clamp-3 text-xs text-foreground">{selectedText}</p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !streamingContent && !thinkingLabel ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-sm text-muted-foreground">
              Ask questions or tell me to edit your worksheet
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
                    <span>Taking action...</span>
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
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <CrmChatContent content={msg.content || "..."} />
                      </div>
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

            {/* Live streaming content bubble */}
            {streamingContent && (
              <div className="group relative">
                <div className="mr-6 rounded-md bg-muted px-3 py-2 text-sm text-foreground">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <CrmChatContent content={streamingContent} />
                  </div>
                </div>
              </div>
            )}

            {/* Thinking / tool-call indicator */}
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

      {/* Input */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Ask or instruct..."
            disabled={isLoading}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          />
          <Button size="icon" className="h-9 w-9" onClick={handleSend} disabled={isLoading}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AIChatPanel;
