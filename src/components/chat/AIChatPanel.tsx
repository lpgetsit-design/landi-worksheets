import { useState, useRef, useCallback, useEffect } from "react";
import { X, RotateCcw, Wrench, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { marked } from "marked";
import CrmChatContent from "./CrmChatContent";
import ChatInput, { type ChatMention } from "./ChatInput";
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

interface AttachmentInfo {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  title: string;
  description: string;
  public_url: string;
}

interface AIChatPanelProps {
  open: boolean;
  onClose: () => void;
  selectedText?: string;
  autoMessage?: string;
  onAutoMessageConsumed?: () => void;
  worksheetContent?: string;
  worksheetTitle?: string;
  worksheetType?: DocumentType;
  worksheetId?: string;
  designActive?: boolean;
  designHtml?: string;
  onDesignHtmlChange?: (html: string) => void;
  onApplyEdit?: (content: string) => void;
  onUpdateTitle?: (title: string) => void;
  onUpdateDocumentType?: (type: DocumentType) => void;
  attachments?: AttachmentInfo[];
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
const DESIGN_CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/design-chat`;

const editorToolLabels: Record<string, string> = {
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

const designToolLabels: Record<string, string> = {
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

const allToolLabels: Record<string, string> = { ...editorToolLabels, ...designToolLabels };

/** Copies AI markdown as rich HTML to clipboard */
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
  autoMessage,
  onAutoMessageConsumed,
  worksheetContent,
  worksheetTitle,
  worksheetType,
  worksheetId,
  designActive,
  designHtml,
  onDesignHtmlChange,
  onApplyEdit,
  onUpdateTitle,
  onUpdateDocumentType,
}: AIChatPanelProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [chatDesignMode, setChatDesignMode] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const autoMessageSentRef = useRef<string | null>(null);
  const designHtmlRef = useRef(designHtml || "");

  // Keep ref in sync
  useEffect(() => {
    designHtmlRef.current = designHtml || "";
  }, [designHtml]);

  // Auto-enable design mode in chat when design panel is activated
  useEffect(() => {
    if (designActive) {
      setChatDesignMode(true);
    }
  }, [designActive]);

  const scrollToBottom = () => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const executeTool = async (name: string, args: string): Promise<string> => {
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
        case "replace_design_html":
          onDesignHtmlChange?.(parsed.html);
          // Persist to meta.design_html
          if (worksheetId) {
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
          }
          return "Webpage updated successfully.";
        default:
          return `Unknown tool: ${name}`;
      }
    } catch (e) {
      return `Tool error: ${e instanceof Error ? e.message : "Unknown error"}`;
    }
  };

  /** Parse SSE stream with token-by-token streaming */
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

    const isDesign = chatDesignMode;
    const url = isDesign ? DESIGN_CHAT_URL : CHAT_URL;
    const body = isDesign
      ? {
          messages: apiMessages,
          worksheetTitle: worksheetTitle || "",
          currentHtml: designHtmlRef.current || "",
          worksheetContent: worksheetContent || "",
        }
      : {
          messages: apiMessages,
          worksheetTitle: worksheetTitle || "",
          worksheetContent: worksheetContent || "",
          worksheetType: worksheetType || "note",
          designHtml: designHtmlRef.current || "",
        };

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify(body),
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
              case "tool_result": {
                const label = allToolLabels[parsed.tool] || parsed.tool;
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
            currentEventType = "";
          } catch {
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

  const handleSend = async (directText?: string, mentions?: ChatMention[]) => {
    const text = (directText ?? "").trim();
    if (!text || isLoading) return;

    // Build mention context to append
    let mentionContext = "";
    if (mentions && mentions.length > 0) {
      const parts: string[] = [];
      for (const m of mentions) {
        if (m.type === "crm") {
          parts.push(`[CRM Reference: ${m.entityType} #${m.entityId} "${m.label}"]`);
        } else if (m.type === "worksheet") {
          parts.push(`[Worksheet Reference: "${m.worksheetTitle}" (ID: ${m.worksheetId}, Type: ${m.documentType})]`);
        }
      }
      mentionContext = "\n\n---\nReferenced entities:\n" + parts.join("\n");
    }

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text + mentionContext };
    let allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setIsLoading(true);
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

          // Handle server-side tool results
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
            if (serverResultIds.has(tc.id)) continue;
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

  // Auto-send message when autoMessage prop is set
  useEffect(() => {
    if (open && autoMessage && autoMessage !== autoMessageSentRef.current && !isLoading) {
      autoMessageSentRef.current = autoMessage;
      handleSend(autoMessage);
      onAutoMessageConsumed?.();
    }
  }, [open, autoMessage]);

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
              {chatDesignMode
                ? "Describe the webpage you want to build"
                : "Ask questions or tell me to edit your worksheet"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => {
              if (msg.role === "tool") {
                return (
                  <div key={msg.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Wrench className="h-3 w-3" />
                    <span>{allToolLabels[msg.name || ""] || msg.name}: {msg.content}</span>
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

      {/* Input area */}
      <ChatInput
        onSend={(text, mentions) => handleSend(text, mentions)}
        isLoading={isLoading}
        chatDesignMode={chatDesignMode}
        designActive={!!designActive}
        onToggleMode={(design) => setChatDesignMode(design)}
        worksheetId={worksheetId}
      />
    </div>
  );
};

export default AIChatPanel;
