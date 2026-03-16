import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Trash2,
  Copy,
  Calendar,
  User,
  GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "backlog", label: "Backlog" },
  { value: "ready", label: "Ready" },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked", label: "Blocked" },
  { value: "review", label: "Review" },
  { value: "done", label: "Done" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const STATUS_COLORS: Record<string, string> = {
  backlog: "bg-muted text-muted-foreground",
  ready: "bg-secondary text-secondary-foreground",
  in_progress: "bg-primary/10 text-primary",
  blocked: "bg-destructive/10 text-destructive",
  review: "bg-accent text-accent-foreground",
  done: "bg-primary text-primary-foreground",
};

const PRIORITY_DOTS: Record<string, string> = {
  low: "bg-muted-foreground",
  medium: "bg-foreground/60",
  high: "bg-foreground",
  urgent: "bg-destructive",
};

const WorkflowCardView = ({ node, updateAttributes, deleteNode, editor }: NodeViewProps) => {
  const attrs = node.attrs;
  const isCollapsed = attrs.isCollapsed;

  const handleDuplicate = () => {
    const pos = editor.view.state.selection.from;
    const newAttrs = {
      ...attrs,
      id: crypto.randomUUID(),
      title: `${attrs.title} (copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    editor
      .chain()
      .focus()
      .insertContentAt(pos, {
        type: "workflowCard",
        attrs: newAttrs,
        content: node.content.toJSON() || [],
      })
      .run();
  };

  return (
    <NodeViewWrapper
      className={cn(
        "my-2 rounded-md border border-border bg-card shadow-sm transition-shadow hover:shadow-md",
        "group/card"
      )}
      data-drag-handle
    >
      {/* Card header — non-editable */}
      <div
        className="flex items-center gap-1.5 px-3 py-2 border-b border-border"
        contentEditable={false}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/card:opacity-100 cursor-grab shrink-0" />

        <button
          onClick={() => updateAttributes({ isCollapsed: !isCollapsed })}
          className="shrink-0 p-0.5 rounded hover:bg-accent"
        >
          {isCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>

        <Badge
          variant="secondary"
          className={cn("text-[10px] px-1.5 py-0 shrink-0", STATUS_COLORS[attrs.status])}
        >
          {STATUS_OPTIONS.find((s) => s.value === attrs.status)?.label || attrs.status}
        </Badge>

        <span
          className={cn("h-2 w-2 rounded-full shrink-0", PRIORITY_DOTS[attrs.priority])}
          title={`Priority: ${attrs.priority}`}
        />

        {attrs.assigneeLabel && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 shrink-0">
            <User className="h-2.5 w-2.5" />
            {attrs.assigneeLabel}
          </span>
        )}

        {attrs.dueDate && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 shrink-0">
            <Calendar className="h-2.5 w-2.5" />
            {new Date(attrs.dueDate).toLocaleDateString()}
          </span>
        )}

        <div className="flex-1" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-0.5 rounded hover:bg-accent opacity-0 group-hover/card:opacity-100">
              <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[140px]">
            <DropdownMenuItem onClick={handleDuplicate}>
              <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => deleteNode()}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Editable title + description */}
      {!isCollapsed && (
        <div className="px-3 py-2">
          <NodeViewContent className="text-sm font-medium text-foreground outline-none" />

          {/* Metadata bar — non-editable */}
          <div
            className="mt-2 flex flex-wrap items-center gap-2"
            contentEditable={false}
          >
            <Select
              value={attrs.status}
              onValueChange={(v) =>
                updateAttributes({ status: v, updatedAt: new Date().toISOString() })
              }
            >
              <SelectTrigger className="h-6 w-[100px] text-[10px] px-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value} className="text-xs">
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={attrs.priority}
              onValueChange={(v) =>
                updateAttributes({ priority: v, updatedAt: new Date().toISOString() })
              }
            >
              <SelectTrigger className="h-6 w-[80px] text-[10px] px-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value} className="text-xs">
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <input
              type="text"
              placeholder="Assignee"
              value={attrs.assigneeLabel}
              onChange={(e) =>
                updateAttributes({
                  assigneeLabel: e.target.value,
                  updatedAt: new Date().toISOString(),
                })
              }
              className="h-6 w-[90px] text-[10px] px-1.5 rounded border border-input bg-background outline-none"
            />

            <input
              type="date"
              value={attrs.dueDate ? attrs.dueDate.split("T")[0] : ""}
              onChange={(e) =>
                updateAttributes({
                  dueDate: e.target.value ? new Date(e.target.value).toISOString() : "",
                  updatedAt: new Date().toISOString(),
                })
              }
              className="h-6 text-[10px] px-1.5 rounded border border-input bg-background outline-none"
            />
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
};

export default WorkflowCardView;
