import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { Plus, GripVertical } from "lucide-react";


const DEFAULT_STAGES = [
  "backlog", "ready", "in_progress", "blocked", "review", "done",
];
const DEFAULT_TITLES: Record<string, string> = {
  backlog: "Backlog", ready: "Ready", in_progress: "In Progress",
  blocked: "Blocked", review: "Review", done: "Done",
};

const WorkflowBoardView = ({ node, updateAttributes, editor, getPos }: NodeViewProps) => {
  const laneCount = node.childCount;

  const handleAddLane = () => {
    const pos = getPos();
    if (pos === undefined) return;
    const endPos = pos + node.nodeSize - 1;
    const nextStageKey = DEFAULT_STAGES[laneCount % DEFAULT_STAGES.length] || "backlog";
    const now = new Date().toISOString();

    editor
      .chain()
      .focus()
      .insertContentAt(endPos, {
        type: "workflowLane",
        attrs: {
          id: crypto.randomUUID(),
          title: DEFAULT_TITLES[nextStageKey] || "New Lane",
          stageKey: nextStageKey,
        },
        content: [
          {
            type: "workflowCard",
            attrs: {
              id: crypto.randomUUID(),
              title: "",
              status: nextStageKey,
              createdAt: now,
              updatedAt: now,
            },
            content: [{ type: "text", text: "New card" }],
          },
        ],
      })
      .run();
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateAttributes({ title: e.target.value });
  };

  return (
    <NodeViewWrapper className="workflow-board my-4 rounded-lg border border-border bg-muted/10" data-drag-handle>
      {/* Board header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30 rounded-t-lg"
        contentEditable={false}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground cursor-grab shrink-0" />
        <input
          type="text"
          value={node.attrs.title}
          onChange={handleTitleChange}
          className="text-sm font-semibold text-foreground bg-transparent outline-none flex-1 min-w-0"
          placeholder="Board title"
        />
        <span className="text-[10px] text-muted-foreground shrink-0">
          {laneCount} {laneCount === 1 ? "lane" : "lanes"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px] text-muted-foreground hover:text-foreground px-2"
          onClick={handleAddLane}
          type="button"
        >
          <Plus className="h-3 w-3 mr-0.5" /> Lane
        </Button>
      </div>

      {/* Lanes container — horizontal scroll with no wrapping */}
      <div className="workflow-board-scroll p-2 overflow-x-auto overflow-y-hidden">
        <NodeViewContent className="workflow-board-lanes" />
      </div>
    </NodeViewWrapper>
  );
};

export default WorkflowBoardView;
