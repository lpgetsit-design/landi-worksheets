import { useState } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, Plus, Pencil, Trash2, Home } from "lucide-react";
import type { FolderNode } from "@/lib/space";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";

interface Props {
  tree: FolderNode[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (parentId: string | null, name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

const NodeRow = ({
  node,
  depth,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  expanded,
  toggle,
  setEditing,
  editingId,
  editingValue,
  setEditingValue,
  commitEdit,
  askDelete,
}: any) => {
  const open = expanded.has(node.id);
  const isSel = selectedId === node.id;
  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md pr-1 hover:bg-accent/50 cursor-pointer",
          isSel && "bg-accent",
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
        {open ? <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" /> : <Folder className="h-3.5 w-3.5 text-muted-foreground" />}
        {editingId === node.id ? (
          <Input
            autoFocus
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={() => commitEdit(node.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit(node.id);
              if (e.key === "Escape") setEditing(null);
            }}
            className="h-6 text-xs px-1 flex-1"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="text-sm flex-1 truncate py-1">{node.name}</span>
        )}
        <div className="opacity-0 group-hover:opacity-100 flex items-center">
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            title="New subfolder"
            onClick={(e) => {
              e.stopPropagation();
              const name = window.prompt("Folder name", "New folder");
              if (name && name.trim()) onCreate(node.id, name.trim());
            }}
          >
            <Plus className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            title="Rename"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(node.id);
              setEditingValue(node.name);
            }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5 text-destructive"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              askDelete(node.id);
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      {open && node.children.length > 0 && (
        <div>
          {node.children.map((c: FolderNode) => (
            <NodeRow
              key={c.id}
              node={c}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onCreate={onCreate}
              onRename={onRename}
              onDelete={onDelete}
              expanded={expanded}
              toggle={toggle}
              setEditing={setEditing}
              editingId={editingId}
              editingValue={editingValue}
              setEditingValue={setEditingValue}
              commitEdit={commitEdit}
              askDelete={askDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const FolderTree = ({ tree, selectedId, onSelect, onCreate, onRename, onDelete }: Props) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditing] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const commitEdit = (id: string) => {
    if (editingValue.trim()) onRename(id, editingValue.trim());
    setEditing(null);
  };

  return (
    <div className="text-sm">
      <div
        className={cn(
          "group flex items-center gap-1.5 rounded-md px-1.5 py-1 cursor-pointer hover:bg-accent/50",
          selectedId === null && "bg-accent",
        )}
        onClick={() => onSelect(null)}
      >
        <Home className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium flex-1">My Space</span>
        <Button
          size="icon"
          variant="ghost"
          className="h-5 w-5 opacity-0 group-hover:opacity-100"
          title="New folder at root"
          onClick={(e) => {
            e.stopPropagation();
            const name = window.prompt("Folder name", "New folder");
            if (name && name.trim()) onCreate(null, name.trim());
          }}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      <div className="mt-1">
        {tree.map((node) => (
          <NodeRow
            key={node.id}
            node={node}
            depth={0}
            selectedId={selectedId}
            onSelect={onSelect}
            onCreate={onCreate}
            onRename={onRename}
            onDelete={onDelete}
            expanded={expanded}
            toggle={toggle}
            setEditing={setEditing}
            editingId={editingId}
            editingValue={editingValue}
            setEditingValue={setEditingValue}
            commitEdit={commitEdit}
            askDelete={setPendingDelete}
          />
        ))}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this folder?</AlertDialogTitle>
            <AlertDialogDescription>
              Subfolders will be deleted. Items inside (designs, documents) will move back to My Space — they are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) onDelete(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FolderTree;