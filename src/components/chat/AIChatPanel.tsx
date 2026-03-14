import { useState } from "react";
import { X, Send, MessageSquare, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface AIChatPanelProps {
  open: boolean;
  onClose: () => void;
  selectedText?: string;
}

const AIChatPanel = ({ open, onClose, selectedText }: AIChatPanelProps) => {
  const [mode, setMode] = useState<"qa" | "edit">("qa");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input,
    };
    setMessages((prev) => [
      ...prev,
      userMsg,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "AI responses will be available once the backend is connected.",
      },
    ]);
    setInput("");
  };

  if (!open) return null;

  return (
    <div className="flex h-full w-[350px] flex-col border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">AI Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => { setMessages([]); setInput(""); }}
            title="Reset conversation"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="flex border-b border-border">
        <button
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors",
            mode === "qa"
              ? "border-b-2 border-foreground text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setMode("qa")}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Q&A
        </button>
        <button
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors",
            mode === "edit"
              ? "border-b-2 border-foreground text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setMode("edit")}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
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
              {mode === "qa"
                ? "Ask questions about your worksheet"
                : "Describe the edits you want to make"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "rounded-md px-3 py-2 text-sm",
                  msg.role === "user"
                    ? "ml-6 bg-primary text-primary-foreground"
                    : "mr-6 bg-muted text-foreground"
                )}
              >
                {msg.content}
              </div>
            ))}
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
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={mode === "qa" ? "Ask a question..." : "Describe your edit..."}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button size="icon" className="h-9 w-9" onClick={handleSend}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AIChatPanel;
