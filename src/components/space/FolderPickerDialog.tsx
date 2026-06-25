import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Home, Folder, ChevronRight, ChevronDown, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSpaceTree } from "@/hooks/useSpaceTree";
import { createFolder } from "@/lib/space";
import { useAuth } from "@/components/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";
import type { FolderNode } from "@/lib/space";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultTitle?: string;
  initialFolderId?: string | null;
  /** When provided, the dialog shows a title field. */
  withTitle?: boolean;
  confirmLabel?: string;
  onConfirm: (folderId: string | null, title?: string) => Promise<void> | void;
}

const Row = ({ node, depth, selectedId, onSelect, expanded, toggle }: any) => {
  const open = expanded.has(node.id);
  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 rounded-md pr-1 hover:bg-accent/50 cursor-pointer",
          selectedId === node.id && "bg-accent",
        )}
        style={{ paddingLeft: depth * 12 }}
        onClick={() => onSelect(node.id)}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggle(node.id);
          }}
          className="h-6 w-5 flex items-center justify-center text-muted-foreground"
        >
          {node.children.length > 0 ? (
            open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
          ) : (
            <span className="w-3" />
          )}
        </button>
        <Folder className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm py-1 truncate">{node.name}</span>
      </div>
      {open &&
        node.children.map((c: FolderNode) => (
          <Row
            key={c.id}
            node={c}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
            expanded={expanded}
            toggle={toggle}
          />
        ))}
    </div>
  );
};

const FolderPickerDialog = ({
  open,
  onOpenChange,
  defaultTitle,
  initialFolderId = null,
  withTitle,
  confirmLabel = "Save to Space",
  onConfirm,
}: Props) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { tree } = useSpaceTree();
  const [selectedId, setSelectedId] = useState<string | null>(initialFolderId);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState(defaultTitle || "");
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const handleCreateFolder = async () => {
    if (!user) return;
    const name = window.prompt("New folder name", "Untitled folder");
    if (!name || !name.trim()) return;
    try {
      const f = await createFolder(user.id, name.trim(), selectedId);
      await qc.invalidateQueries({ queryKey: ["space_folders"] });
      setSelectedId(f.id);
      if (f.parent_id) {
        setExpanded((prev) => new Set(prev).add(f.parent_id!));
      }
    } catch (e: any) {
      toast.error(e.message || "Could not create folder");
    }
  };

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm(selectedId, withTitle ? title.trim() || defaultTitle || "Untitled" : undefined);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save to Space</DialogTitle>
        </DialogHeader>
        {withTitle && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={defaultTitle || "Untitled"}
            />
          </div>
        )}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Folder</label>
            <Button size="sm" variant="ghost" className="h-6 gap-1 text-xs" onClick={handleCreateFolder}>
              <Plus className="h-3 w-3" /> New folder
            </Button>
          </div>
          <div className="border border-border rounded-md p-1 max-h-64 overflow-y-auto">
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-md px-1.5 py-1 cursor-pointer hover:bg-accent/50",
                selectedId === null && "bg-accent",
              )}
              onClick={() => setSelectedId(null)}
            >
              <Home className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium text-sm">My Space</span>
            </div>
            {tree.map((n) => (
              <Row
                key={n.id}
                node={n}
                depth={0}
                selectedId={selectedId}
                onSelect={setSelectedId}
                expanded={expanded}
                toggle={toggle}
              />
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={busy} className="gap-1.5">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FolderPickerDialog;