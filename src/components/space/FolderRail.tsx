import { useRef, useState } from "react";
import { Folder, Home, Plus, User } from "lucide-react";
import { cn } from "@/lib/utils";
import FolderTree from "./FolderTree";
import type { FolderNode } from "@/lib/space";

interface FolderRailProps {
  tree: FolderNode[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (parentId: string | null, name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  isLoading?: boolean;
}

export function FolderRail({
  tree,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  isLoading,
}: FolderRailProps) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(true);
  };

  const handleLeave = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  };

  return (
    <div
      className="hidden md:flex items-center justify-center h-full w-16 shrink-0"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {/* Expanded folder tree panel */}
      <div
        className={cn(
          "absolute right-full top-1/2 -translate-y-1/2 mr-2 w-64 h-[min(600px,calc(100vh-6rem))] flex flex-col rounded-3xl bg-card/95 backdrop-blur-md border border-border/60 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-4 transition-all duration-300 ease-out z-40",
          open
            ? "opacity-100 translate-x-0 pointer-events-auto"
            : "opacity-0 translate-x-2 pointer-events-none"
        )}
      >
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80">
            Workspace
          </div>
          <div className="font-serif text-lg italic">Folders</div>
        </div>
        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {isLoading ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : (
            <FolderTree
              tree={tree}
              selectedId={selectedId}
              onSelect={onSelect}
              onCreate={onCreate}
              onRename={onRename}
              onDelete={onDelete}
            />
          )}
        </div>
      </div>

      {/* Floating micro-rail */}
      <aside
        className={cn(
          "relative flex flex-col items-center w-14 h-[min(600px,calc(100vh-6rem))] rounded-full bg-card/80 backdrop-blur-md border border-border/60 shadow-[0_8px_30px_rgba(0,0,0,0.04)] py-4 transition-all duration-300 ease-out z-50",
          open && "bg-card/95"
        )}
      >
        {/* Workspace badge */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={() => onSelect(null)}
            className={cn(
              "w-10 h-10 flex items-center justify-center rounded-full font-serif text-xl italic shadow-md transition-transform hover:scale-105",
              selectedId === null
                ? "bg-primary text-primary-foreground"
                : "bg-foreground text-background"
            )}
            title="My Space"
          >
            W
          </button>
          <div className="w-6 h-px bg-border/60" />
        </div>

        {/* Folder icons */}
        <nav className="flex-1 flex flex-col items-center gap-2 overflow-y-auto py-2 w-full">
          {isLoading ? (
            <div className="w-2 h-2 rounded-full bg-muted-foreground/30 animate-pulse" />
          ) : (
            tree.map((node) => {
              const isSel = selectedId === node.id;
              return (
                <button
                  key={node.id}
                  onClick={() => onSelect(node.id)}
                  className={cn(
                    "group relative w-10 h-10 flex items-center justify-center rounded-xl transition-colors",
                    isSel
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                  )}
                  title={node.name}
                >
                  <Folder className="h-5 w-5" />
                  <span className="absolute right-full top-1/2 -translate-y-1/2 mr-2 px-2 py-1 bg-foreground text-background text-xs font-serif italic rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                    {node.name}
                  </span>
                </button>
              );
            })
          )}
        </nav>

        {/* Actions */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-px bg-border/60" />
          <button
            className="group relative w-10 h-10 flex items-center justify-center rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-all"
            title="New folder"
            onClick={() => {
              const name = window.prompt("Folder name", "New folder");
              if (name?.trim()) onCreate(null, name.trim());
            }}
          >
            <Plus className="h-5 w-5" />
            <span className="absolute right-full top-1/2 -translate-y-1/2 mr-2 px-2 py-1 bg-foreground text-background text-xs font-serif italic rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              New folder
            </span>
          </button>
          <button className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground/60 hover:text-muted-foreground transition-colors">
            <User className="h-4 w-4" />
          </button>
        </div>
      </aside>
    </div>
  );
}

export default FolderRail;
