import { useState, useRef, useCallback, useEffect } from "react";
import { Send, Paintbrush, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import ChatMentionMenu, { type MentionItem, type ChatMentionMenuRef } from "./ChatMentionMenu";

export interface ChatMention {
  type: "crm" | "worksheet";
  label: string;
  entityType?: string;
  entityId?: number;
  worksheetId?: string;
  worksheetTitle?: string;
  documentType?: string;
}

interface ChatInputProps {
  onSend: (text: string, mentions: ChatMention[]) => void;
  isLoading: boolean;
  chatDesignMode: boolean;
  designActive: boolean;
  onToggleMode: (design: boolean) => void;
  worksheetId?: string;
}

const ChatInput = ({
  onSend,
  isLoading,
  chatDesignMode,
  designActive,
  onToggleMode,
  worksheetId,
}: ChatInputProps) => {
  const [input, setInput] = useState("");
  const [mentions, setMentions] = useState<ChatMention[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartPos, setMentionStartPos] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionMenuRef = useRef<ChatMentionMenuRef>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 150) + "px";
  }, [input]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isLoading) return;
    onSend(text, mentions);
    setInput("");
    setMentions([]);
    setMentionOpen(false);
    setMentionQuery("");
    setMentionStartPos(null);
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, isLoading, mentions, onSend]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setInput(value);

    // Check for @ trigger
    if (mentionStartPos !== null) {
      // We're in mention mode — extract query from @ to cursor
      const query = value.slice(mentionStartPos + 1, cursorPos);
      if (query.includes("\n") || (cursorPos <= mentionStartPos)) {
        // Cancel mention
        setMentionOpen(false);
        setMentionStartPos(null);
        setMentionQuery("");
      } else {
        setMentionQuery(query);
      }
    }
  }, [mentionStartPos]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // If mention menu is open, delegate key handling
    if (mentionOpen && mentionMenuRef.current) {
      const handled = mentionMenuRef.current.onKeyDown(e);
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    // @ trigger
    if (e.key === "@") {
      const cursorPos = textareaRef.current?.selectionStart ?? 0;
      const charBefore = input[cursorPos - 1];
      // Only trigger after whitespace, newline, or at start
      if (cursorPos === 0 || !charBefore || /[\s\n]/.test(charBefore)) {
        setMentionStartPos(cursorPos);
        setMentionQuery("");
        setMentionOpen(true);
      }
    }

    // Enter to send (without shift)
    if (e.key === "Enter" && !e.shiftKey && !mentionOpen) {
      e.preventDefault();
      handleSend();
    }
  }, [mentionOpen, input, handleSend]);

  const handleMentionSelect = useCallback((item: MentionItem) => {
    if (mentionStartPos === null) return;

    const cursorPos = textareaRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, mentionStartPos);
    const after = input.slice(cursorPos);

    // Build display text
    let displayText: string;
    if (item.type === "crm") {
      displayText = `@${item.label} `;
    } else {
      displayText = `@${item.label} `;
    }

    setInput(before + displayText + after);
    setMentions((prev) => [...prev, item as ChatMention]);
    setMentionOpen(false);
    setMentionStartPos(null);
    setMentionQuery("");

    // Restore focus and cursor
    setTimeout(() => {
      const el = textareaRef.current;
      if (el) {
        const newPos = before.length + displayText.length;
        el.focus();
        el.setSelectionRange(newPos, newPos);
      }
    }, 0);
  }, [mentionStartPos, input]);

  const handleMentionClose = useCallback(() => {
    setMentionOpen(false);
    setMentionStartPos(null);
    setMentionQuery("");
  }, []);

  return (
    <div className="border-t border-border p-3">
      {/* Mode toggle */}
      {designActive && (
        <div className="flex items-center gap-1 mb-2">
          <button
            onClick={() => onToggleMode(false)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              !chatDesignMode
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            <PenLine className="h-3 w-3" />
            Editor
          </button>
          <button
            onClick={() => onToggleMode(true)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              chatDesignMode
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            <Paintbrush className="h-3 w-3" />
            Design
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="relative">
        {/* Mention menu - positioned above the textarea */}
        {mentionOpen && (
          <div className="absolute bottom-full left-0 mb-1 z-50">
            <ChatMentionMenu
              ref={mentionMenuRef}
              query={mentionQuery}
              onSelect={handleMentionSelect}
              onClose={handleMentionClose}
              excludeWorksheetId={worksheetId}
            />
          </div>
        )}

        {/* Mention badges */}
        {mentions.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {mentions.map((m, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {m.type === "crm" ? "🏢" : "📄"} {m.label}
                <button
                  onClick={() => setMentions((prev) => prev.filter((_, idx) => idx !== i))}
                  className="hover:text-foreground ml-0.5"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={
              chatDesignMode
                ? "Describe your webpage… (@ to mention)"
                : "Ask or instruct… (@ to mention)"
            }
            disabled={isLoading}
            rows={1}
            className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 min-h-[36px] max-h-[150px] leading-5"
          />
          <Button
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={handleSend}
            disabled={isLoading}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
