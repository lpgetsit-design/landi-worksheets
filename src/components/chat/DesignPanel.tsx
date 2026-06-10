import { ChevronLeft, ChevronRight, Save, ExternalLink, X, Check, Pencil, Share2, MousePointerClick, Loader2, Undo2, Redo2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import DesignPreview from "@/components/design/DesignPreview";
import DesignEditor, { type DesignEditorHandle, type DesignEditorState } from "@/components/design/DesignEditor";
import { cn } from "@/lib/utils";

export interface DesignRevision {
  id: string;
  revision_index: number;
  html: string;
}

export interface ChatDesign {
  id: string;
  title: string;
  status: "active" | "saved";
  updated_at: string;
  revisions: DesignRevision[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  design: ChatDesign | null;
  revisionIndex: number;
  onChangeRevision: (i: number) => void;
  onSave: () => void;
  saving?: boolean;
  onRenameTitle?: (title: string) => void;
  savedDesigns: ChatDesign[];
  onOpenSaved: (designId: string) => void;
  onShare?: () => void;
  /** Called when the user saves WYSIWYG edits — should append a new revision. */
  onSaveEditedHtml?: (html: string) => Promise<void> | void;
}

const DesignPanel = ({
  open,
  onClose,
  design,
  revisionIndex,
  onChangeRevision,
  onSave,
  saving,
  onRenameTitle,
  savedDesigns,
  onOpenSaved,
  onShare,
  onSaveEditedHtml,
}: Props) => {
  if (!open) return null;

  const revisions = design?.revisions ?? [];
  const total = revisions.length;
  const current = revisions[revisionIndex] ?? null;

  const editorRef = useRef<DesignEditorHandle>(null);
  const [editMode, setEditMode] = useState(false);
  const [savingEdits, setSavingEdits] = useState(false);
  const [editorState, setEditorState] = useState<DesignEditorState>({ canUndo: false, canRedo: false });

  const handleSaveEdits = async () => {
    if (!editorRef.current || !onSaveEditedHtml) return;
    setSavingEdits(true);
    try {
      const html = await editorRef.current.getEditedHtml();
      await onSaveEditedHtml(html);
      setEditMode(false);
    } finally {
      setSavingEdits(false);
    }
  };

  return (
    <aside
      className={cn(
        "flex h-full w-full max-w-[640px] flex-col border-l border-border bg-background",
        "shadow-xl",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {design ? (
            <input
              value={design.title}
              onChange={(e) => onRenameTitle?.(e.target.value)}
              className="bg-transparent text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring rounded px-1 min-w-0 flex-1"
            />
          ) : (
            <span className="text-sm text-muted-foreground">No design yet</span>
          )}
          {design?.status === "saved" && (
            <span className="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Saved</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {current && onSaveEditedHtml && (
            editMode ? (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => editorRef.current?.undo()}
                  disabled={!editorState.canUndo || savingEdits}
                  title="Undo (Ctrl/Cmd+Z)"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => editorRef.current?.redo()}
                  disabled={!editorState.canRedo || savingEdits}
                  title="Redo (Ctrl/Cmd+Shift+Z)"
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 gap-1.5 text-xs"
                  onClick={handleSaveEdits}
                  disabled={savingEdits}
                >
                  {savingEdits ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save edits
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => setEditMode(false)}
                  disabled={savingEdits}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                onClick={() => setEditMode(true)}
                title="Edit text and reorder blocks"
              >
                <MousePointerClick className="h-3 w-3" /> Edit
              </Button>
            )
          )}
          {design && total > 0 && onShare && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={onShare}
              title="Share with external recipient"
            >
              <Share2 className="h-3 w-3" /> Share
            </Button>
          )}
          {design && design.status === "active" && total > 0 && !editMode && (
            <Button
              size="sm"
              variant="default"
              className="h-7 gap-1.5 text-xs"
              onClick={onSave}
              disabled={saving}
            >
              <Save className="h-3 w-3" /> Save draft
            </Button>
          )}
          {current && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              title="Open in new tab"
              onClick={() => {
                const blob = new Blob([current.html], { type: "text/html" });
                window.open(URL.createObjectURL(blob), "_blank");
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {total > 1 && (
        <div className="flex items-center justify-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            disabled={revisionIndex <= 0}
            onClick={() => onChangeRevision(revisionIndex - 1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span>
            Revision {revisionIndex + 1} / {total}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            disabled={revisionIndex >= total - 1}
            onClick={() => onChangeRevision(revisionIndex + 1)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-hidden p-2 bg-muted/30">
        {current ? (
          editMode ? (
            <DesignEditor
              ref={editorRef}
              html={current.html}
              editMode={editMode}
              onStateChange={setEditorState}
            />
          ) : (
            <DesignPreview html={current.html} />
          )
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Ask the assistant to build a webpage, report, or one-pager.
          </div>
        )}
      </div>
      {editMode && (
        <div className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground bg-muted/40">
          Click text to edit. Click any block to select, then use the toolbar to duplicate, delete, or reorder. Drag to move blocks anywhere — including into other containers.
        </div>
      )}

      {savedDesigns.length > 0 && (
        <div className="border-t border-border p-2 max-h-48 overflow-y-auto">
          <div className="px-1 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Saved drafts ({savedDesigns.length})
          </div>
          <div className="grid grid-cols-2 gap-2">
            {savedDesigns.map((d) => (
              <button
                key={d.id}
                onClick={() => onOpenSaved(d.id)}
                className={cn(
                  "group text-left rounded-md border border-border bg-card hover:border-primary/50 transition-colors p-2",
                  design?.id === d.id && "border-primary",
                )}
              >
                <div className="flex items-center gap-1 mb-1">
                  <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                  <span className="text-[11px] font-medium truncate flex-1">{d.title}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {d.revisions.length} revision{d.revisions.length === 1 ? "" : "s"}
                </div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                  {new Date(d.updated_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
};

export default DesignPanel;