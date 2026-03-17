import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function WorksheetBadgeView({ node }: NodeViewProps) {
  const { worksheetId, title } = node.attrs;
  const navigate = useNavigate();

  return (
    <NodeViewWrapper as="span" className="inline">
      <HoverCard openDelay={200} closeDelay={100}>
        <HoverCardTrigger asChild>
          <span
            className="inline-flex max-w-full overflow-hidden items-center gap-1 rounded border border-border bg-accent/50 px-1.5 py-0.5 text-xs font-medium text-foreground align-baseline mx-0.5 select-none cursor-pointer hover:bg-accent transition-colors"
            contentEditable={false}
            onClick={() => navigate(`/worksheet/${worksheetId}`)}
          >
            <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="truncate min-w-0">{title}</span>
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
