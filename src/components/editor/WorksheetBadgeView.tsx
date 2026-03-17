import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { FileText, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function WorksheetBadgeView({ node, editor, getPos }: NodeViewProps) {
  const { worksheetId, title } = node.attrs;
  const navigate = useNavigate();
  const isEditable = editor?.isEditable ?? false;

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!editor || typeof getPos !== "function") return;
    const pos = getPos();
    editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
  };

  return (
    <NodeViewWrapper as="span" className="inline">
      <HoverCard openDelay={200} closeDelay={100}>
        <HoverCardTrigger asChild>
          <span
            className="inline-flex max-w-full overflow-hidden items-center gap-1 rounded border border-border bg-accent/50 px-1.5 py-0.5 text-xs font-medium text-foreground align-baseline mx-0.5 select-none cursor-pointer hover:bg-accent transition-colors group/badge"
            contentEditable={false}
            onClick={() => navigate(`/worksheet/${worksheetId}`)}
          >
            <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="truncate min-w-0">{title}</span>
            {isEditable && (
              <button
                type="button"
                className="shrink-0 ml-0.5 rounded-sm opacity-0 group-hover/badge:opacity-100 hover:bg-foreground/10 transition-opacity p-0"
                onClick={handleRemove}
                aria-label="Remove badge"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </span>
        </HoverCardTrigger>
        <HoverCardContent side="top" align="start" className="w-60 p-3">
          <div className="flex items-start gap-2">
            <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground leading-tight truncate">{title}</p>
              <p className="text-[10px] text-muted-foreground mt-1 font-mono truncate">{worksheetId.slice(0, 8)}…</p>
              <p className="text-xs text-muted-foreground mt-1.5">Click to open worksheet</p>
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    </NodeViewWrapper>
  );
}
