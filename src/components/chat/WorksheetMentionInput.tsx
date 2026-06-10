import { useState, useRef, useCallback, useEffect } from "react";
import { Send, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWorksheetSearch, type WorksheetSearchResult } from "@/hooks/useWorksheetSearch";
import { cn } from "@/lib/utils";

export interface WorksheetMention {
  worksheetId: string;
  title: string;
  documentType: string;
}

interface Props {
  onSend: (text: string, mentions: WorksheetMention[]) => void;
  isLoading: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  note: "Note",
  skill: "Skill",
  prompt: "Prompt",
  template: "Template",
};

const WorksheetMentionInput = ({ onSend, isLoading }: Props) => {
  const [input, setInput] = useState("");
  const [mentions, setMentions] = useState<WorksheetMention[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [startPos, setStartPos] = useState<number | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: results, loading } = useWorksheetSearch(query, menuOpen);

  // Auto-resize
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [results]);

  const closeMenu = () => {
    setMenuOpen(false);
    setStartPos(null);
    setQuery("");
  };

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isLoading) return;
    onSend(text, mentions);
    setInput("");
    setMentions([]);
    closeMenu();
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [input, isLoading, mentions, onSend]);

  const selectResult = useCallback(
    (ws: WorksheetSearchResult) => {
      if (startPos === null) return;
      const cursor = textareaRef.current?.selectionStart ?? input.length;
      const before = input.slice(0, startPos);
      const after = input.slice(cursor);
      const display = `@${ws.title} `;
      const newInput = before + display + after;
      setInput(newInput);
      setMentions((prev) => {
        if (prev.some((m) => m.worksheetId === ws.id)) return prev;
        return [...prev, { worksheetId: ws.id, title: ws.title, documentType: ws.document_type }];
      });
      closeMenu();
      setTimeout(() => {
        const el = textareaRef.current;
        if (el) {
          const pos = before.length + display.length;
          el.focus();
          el.setSelectionRange(pos, pos);
        }
      }, 0);
    },
    [startPos, input],
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart;
    setInput(value);
    if (startPos !== null) {
      if (cursor <= startPos) {
        closeMenu();
      } else {
        const q = value.slice(startPos + 1, cursor);
        if (q.includes("\n") || q.includes(" ")) {
          // Allow spaces? Keep menu open until newline. Title can have spaces.
          if (q.includes("\n")) {
            closeMenu();
          } else {
            setQuery(q);
          }
        } else {
          setQuery(q);
        }
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen && results.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => (i >= results.length - 1 ? 0 : i + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => (i <= 0 ? results.length - 1 : i - 1));
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const ws = results[selectedIdx];
        if (ws) selectResult(ws);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
        return;
      }
    }

    if (e.key === "@") {
      const cursor = textareaRef.current?.selectionStart ?? 0;
      const charBefore = input[cursor - 1];
      if (cursor === 0 || !charBefore || /\s/.test(charBefore)) {
        setStartPos(cursor);
        setQuery("");
        setMenuOpen(true);
        setSelectedIdx(0);
      }
    }

    if (e.key === "Enter" && !e.shiftKey && !menuOpen) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-border p-3 bg-background">
      <div className="relative mx-auto max-w-3xl">
        {menuOpen && (
          <div className="absolute bottom-full left-0 mb-2 z-50 w-80 rounded-md border border-border bg-popover shadow-md overflow-hidden">
            <div className="px-3 py-2 border-b border-border flex items-center gap-2">
              <FileText className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Reference worksheet:</span>
              <span className="text-sm text-foreground font-medium truncate">
                {query || <span className="text-muted-foreground italic">type to search…</span>}
              </span>
              {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />}
            </div>
            <div className="max-h-[240px] overflow-y-auto p-1">
              {!loading && results.length === 0 && (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                  No worksheets found
                </div>
              )}
              {results.map((ws, i) => {
                const isSel = i === selectedIdx;
                return (
                  <button
                    key={ws.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectResult(ws);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left",
                      isSel ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent/50",
                    )}
                  >
                    <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                      {TYPE_LABELS[ws.document_type] || ws.document_type}
                    </Badge>
                    <span className="truncate">{ws.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {mentions.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {mentions.map((m) => (
              <span
                key={m.worksheetId}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                <FileText className="h-3 w-3" /> {m.title}
                <button
                  className="hover:text-foreground ml-0.5"
                  onClick={() =>
                    setMentions((prev) => prev.filter((x) => x.worksheetId !== m.worksheetId))
                  }
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
            placeholder="Ask anything… type @ to reference a worksheet"
            disabled={isLoading}
            rows={1}
            autoFocus
            className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 min-h-[40px] max-h-[200px] leading-5"
          />
          <Button size="icon" className="h-10 w-10 shrink-0" onClick={handleSend} disabled={isLoading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WorksheetMentionInput;