import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { Plus, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

const STAGE_LABELS: Record<string, string> = {
  backlog: "Backlog",
  ready: "Ready",
  in_progress: "In Progress",
  blocked: "Blocked",
  review: "Review",
  done: "Done",
};

const WorkflowLaneView = ({ node, updateAttributes, editor, getPos }: NodeViewProps) => {
  const attrs = node.attrs;
  const cardCount = node.childCount;
  const wipLimit = attrs.wipLimit || 0;
  const overWip = wipLimit > 0 && cardCount > wipLimit;

  const handleAddCard = () => {
    const pos = getPos();
    if (pos === undefined) return;
    // Insert at end of lane content
    const endPos = pos + node.nodeSize - 1;
    editor
      .chain()
      .focus()
      .insertContentAt(endPos, {
        type: "workflowCard",
        attrs: {
          id: crypto.randomUUID(),
          title: "",
          status: attrs.stageKey,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        content: [{ type: "text", text: "New card" }],
      })
      .run();
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateAttributes({ title: e.target.value });
  };

  return (
    <NodeViewWrapper
      className={cn(
        "rounded-lg border border-border bg-muted/30 flex-1 min-w-[220px]",
        "group/lane"
      )}
    >
      {/* Lane header — non-editable */}
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border bg-muted/50 rounded-t-lg"
        contentEditable={false}
      >
        <GripVertical className="h-3 w-3 text-muted-foreground opacity-0 group-hover/lane:opacity-100 cursor-grab shrink-0" />

        <input
          type="text"
          value={attrs.title}
          onChange={handleTitleChange}
          className="text-xs font-semibold text-foreground bg-transparent outline-none flex-1 min-w-0"
          placeholder="Lane title"
        />

        <span className="text-[9px] text-muted-foreground shrink-0">
          {cardCount}{wipLimit > 0 ? `/${wipLimit}` : ""}
        </span>

        {overWip && (
          <span className="text-[9px] text-destructive font-medium shrink-0">
            Over
          </span>
        )}
      </div>

      {/* Cards rendered as nested content */}
      <div className="px-1 py-1 min-h-[32px]">
        <NodeViewContent />
      </div>

      {/* Add card footer */}
      <div className="px-1 pb-1" contentEditable={false}>
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-6 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={handleAddCard}
          type="button"
        >
          <Plus className="h-2.5 w-2.5 mr-0.5" /> Add Card
        </Button>
      </div>
    </NodeViewWrapper>
  );
};

export default WorkflowLaneView;
