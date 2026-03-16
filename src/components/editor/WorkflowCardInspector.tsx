import { useEffect, useState, useCallback } from "react";
import type { Editor } from "@tiptap/core";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

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

interface WorkflowCardInspectorProps {
  editor: Editor;
  onClose: () => void;
}

const WorkflowCardInspector = ({ editor, onClose }: WorkflowCardInspectorProps) => {
  const [attrs, setAttrs] = useState<Record<string, any> | null>(null);
  const [pos, setPos] = useState<number | null>(null);

  const syncFromEditor = useCallback(() => {
    const { state } = editor;
    const { from } = state.selection;
    const resolved = state.doc.resolve(from);

    // Walk up from cursor to find workflowCard node
    for (let depth = resolved.depth; depth >= 0; depth--) {
      const node = resolved.node(depth);
      if (node.type.name === "workflowCard") {
        setAttrs({ ...node.attrs });
        setPos(resolved.before(depth));
        return;
      }
    }
    setAttrs(null);
    setPos(null);
  }, [editor]);

  useEffect(() => {
    syncFromEditor();
    editor.on("selectionUpdate", syncFromEditor);
    return () => {
      editor.off("selectionUpdate", syncFromEditor);
    };
  }, [editor, syncFromEditor]);

  const update = (key: string, value: any) => {
    if (pos === null) return;
    const newAttrs = { ...attrs, [key]: value, updatedAt: new Date().toISOString() };
    setAttrs(newAttrs);

    const tr = editor.state.tr;
    const node = editor.state.doc.nodeAt(pos);
    if (node && node.type.name === "workflowCard") {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, [key]: value, updatedAt: new Date().toISOString() });
      editor.view.dispatch(tr);
    }
  };

  if (!attrs) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Select a workflow card to inspect it.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">Card Inspector</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Title</Label>
        <Input
          value={attrs.title}
          onChange={(e) => update("title", e.target.value)}
          className="h-8 text-xs"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Description</Label>
        <Textarea
          value={attrs.description}
          onChange={(e) => update("description", e.target.value)}
          className="text-xs min-h-[60px]"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={attrs.status} onValueChange={(v) => update("status", v)}>
            <SelectTrigger className="h-8 text-xs">
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
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Priority</Label>
          <Select value={attrs.priority} onValueChange={(v) => update("priority", v)}>
            <SelectTrigger className="h-8 text-xs">
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
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Assignee</Label>
        <Input
          value={attrs.assigneeLabel}
          onChange={(e) => update("assigneeLabel", e.target.value)}
          placeholder="Name"
          className="h-8 text-xs"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Due Date</Label>
        <Input
          type="date"
          value={attrs.dueDate ? attrs.dueDate.split("T")[0] : ""}
          onChange={(e) =>
            update("dueDate", e.target.value ? new Date(e.target.value).toISOString() : "")
          }
          className="h-8 text-xs"
        />
      </div>

      <div className="text-[10px] text-muted-foreground mt-2">
        ID: {attrs.id ? attrs.id.slice(0, 8) : "—"}
        {attrs.createdAt && (
          <> · Created {new Date(attrs.createdAt).toLocaleDateString()}</>
        )}
      </div>
    </div>
  );
};

export default WorkflowCardInspector;
