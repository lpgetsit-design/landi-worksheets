import { useState, useRef } from "react";
import { X, Send, RotateCcw, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
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

  const callAgent = async (conversationMessages: Message[]): Promise<void> => {
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
      return;
    }

    const choice = await resp.json();
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: choice.message?.content || "",
      tool_calls: choice.message?.tool_calls,
    };

    const updatedMessages = [...conversationMessages, assistantMsg];
    setMessages(updatedMessages);
    scrollToBottom();

    // If the AI returned tool calls, execute them and continue the loop
    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
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

      const withToolResults = [...updatedMessages, ...toolResultMessages];
      setMessages(withToolResults);
      scrollToBottom();

      // Continue the agentic loop
      await callAgent(withToolResults);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput("");
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await callAgent(allMessages);
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error("Chat error:", e);
        toast.error("Failed to get AI response");
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  if (!open) return null;

  return (
    <div className="flex h-full w-full md:w-[350px] flex-col border-l border-border bg-background">
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
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-sm text-muted-foreground">
              Ask questions or tell me to edit your worksheet
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => {
              // Tool result messages — show as inline action indicators
              if (msg.role === "tool") {
                return (
                  <div key={msg.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Wrench className="h-3 w-3" />
                    <span>{toolLabels[msg.name || ""] || msg.name}: {msg.content}</span>
                  </div>
                );
              }

              // Assistant messages with tool_calls but no text — show action indicator
              if (msg.role === "assistant" && msg.tool_calls && !msg.content) {
                return (
                  <div key={msg.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Wrench className="h-3 w-3 animate-spin" />
                    <span>Taking action...</span>
                  </div>
                );
              }

              // Skip assistant messages that are just tool-call wrappers with no content
              if (msg.role === "assistant" && !msg.content && !msg.tool_calls) return null;

              return (
                <div key={msg.id}>
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
                </div>
              );
            })}
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
