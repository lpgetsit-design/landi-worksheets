import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Save,
  ExternalLink,
  X,
  Pencil,
  Share2,
  FolderPlus,
  Loader2,
  Check,
  FileText,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import WorksheetEditor, { type WorksheetEditorHandle } from "@/components/editor/WorksheetEditor";
import FolderPickerDialog from "@/components/space/FolderPickerDialog";
import type { ChatWorksheet } from "@/lib/worksheetArtifacts";

interface Props {
  open: boolean;
  onClose: () => void;
  worksheet: ChatWorksheet | null;
  revisionIndex: number;
  onChangeRevision: (i: number) => void;
  onRenameTitle?: (title: string) => void;
  onSaveEdits: (html: string, md: string, json: any) => Promise<void> | void;
  onSaveToSpace: (folderId: string | null, title: string) => Promise<void> | void;
  onShare?: () => void;
  savedWorksheets: ChatWorksheet[];
  onOpenSaved: (id: string) => void;
  saving?: boolean;
}

const openWorksheetPdf = (html: string, title: string) => {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  const css = `
    @page { size: A4; margin: 20mm; }
    body { font-family: 'Source Serif 4', Georgia, serif; line-height: 1.7; color: #1a1a1a; max-width: 700px; margin: 0 auto; padding: 2rem; }
    h1 { font-size: 1.8rem; margin-bottom: 1.5rem; } h2, h3 { margin-top: 1.5rem; }
    table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  `;
  const doc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${css}</style><script>window.onload=function(){setTimeout(function(){window.print();},300);}<\/script></head><body><h1>${title}</h1>${html}</body></html>`;
  printWindow.document.open();
  printWindow.document.write(doc);
  printWindow.document.close();
};

const WorksheetPanel = ({
  open,
  onClose,
  worksheet,
  revisionIndex,
  onChangeRevision,
  onRenameTitle,
  onSaveEdits,
  onSaveToSpace,
  onShare,
  savedWorksheets,
  onOpenSaved,
  saving,
}: Props) => {
  if (!open) return null;

  const revs = worksheet?.revisions ?? [];
  const total = revs.length;
  const current = revs[revisionIndex] ?? null;
  const isLatest = total > 0 && revisionIndex === total - 1;
  const editorRef = useRef<WorksheetEditorHandle | null>(null);

  const [savePickerOpen, setSavePickerOpen] = useState(false);
  const [savingEdits, setSavingEdits] = useState(false);

  // Reset editor ref on revision change (we remount via key below).
  useEffect(() => {
    editorRef.current = null;
  }, [worksheet?.id, revisionIndex]);

  const handleSaveEdits = async () => {
    if (!editorRef.current) return;
    const html = editorRef.current.getHTML();
    const md = (window as any).__turndown
      ? (window as any).__turndown(html)
      : html.replace(/<[^>]+>/g, "");
    setSavingEdits(true);
    try {
      await onSaveEdits(html, md, null);
    } finally {
      setSavingEdits(false);
    }
  };

  return (
    <aside className="flex h-full w-full max-w-[640px] flex-col border-l border-border bg-background shadow-xl">
      <div className="flex items-center justify-between border-b border-border px-3 py-2 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {worksheet ? (
            <input
              value={worksheet.title}
              onChange={(e) => onRenameTitle?.(e.target.value)}
              className="bg-transparent text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring rounded px-1 min-w-0 flex-1"
            />
          ) : (
            <span className="text-sm text-muted-foreground">No worksheet yet</span>
          )}
          {worksheet?.status === "saved" && (
            <span className="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Saved
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {current && isLatest && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={handleSaveEdits}
              disabled={savingEdits}
              title="Snapshot the current edits as a new revision"
            >
              {savingEdits ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save edits
            </Button>
          )}
          {worksheet && total > 0 && onShare && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={onShare}
              title="Share with an external recipient"
            >
              <Share2 className="h-3 w-3" /> Share
            </Button>
          )}
          {worksheet && worksheet.status === "active" && total > 0 && (
            <Button
              size="sm"
              variant="default"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setSavePickerOpen(true)}
              disabled={saving}
            >
              <FolderPlus className="h-3 w-3" /> Save to Space
            </Button>
          )}
          {current?.content_html && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              title="Open as printable PDF"
              onClick={() => openWorksheetPdf(current.content_html || "", worksheet?.title || "Worksheet")}
            >
              <Download className="h-3.5 w-3.5" />
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
            Revision {revisionIndex + 1} / {total} {isLatest ? "(latest)" : ""}
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

      <div className="flex-1 overflow-y-auto p-4 bg-muted/30">
        {!current ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Ask the assistant to draft a worksheet, note, or document.
          </div>
        ) : isLatest && worksheet ? (
          <WorksheetEditor
            key={worksheet.id}
            worksheetId={worksheet.id}
            initialTitle={worksheet.title}
            initialContent={
              (current.content_json ?? worksheet.content_json ?? current.content_html ?? worksheet.content_html ?? "") as any
            }
            initialDocumentType={"note"}
            editorRef={editorRef as any}
          />
        ) : (
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: current.content_html || "" }}
          />
        )}
      </div>

      {savedWorksheets.length > 0 && (
        <div className="border-t border-border p-2 max-h-44 overflow-y-auto">
          <div className="px-1 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Saved worksheets ({savedWorksheets.length})
          </div>
          <div className="grid grid-cols-2 gap-2">
            {savedWorksheets.map((w) => (
              <button
                key={w.id}
                onClick={() => onOpenSaved(w.id)}
                className={cn(
                  "text-left rounded-md border border-border bg-card hover:border-primary/50 transition-colors p-2",
                  worksheet?.id === w.id && "border-primary",
                )}
              >
                <div className="flex items-center gap-1 mb-1">
                  <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                  <span className="text-[11px] font-medium truncate flex-1">{w.title}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {w.revisions.length} revision{w.revisions.length === 1 ? "" : "s"}
                </div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                  {new Date(w.updated_at).toLocaleString(undefined, {
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

      <FolderPickerDialog
        open={savePickerOpen}
        onOpenChange={setSavePickerOpen}
        withTitle
        defaultTitle={worksheet?.title}
        confirmLabel="Save to Space"
        onConfirm={async (folderId, title) => {
          await onSaveToSpace(folderId, title || worksheet?.title || "Untitled worksheet");
        }}
      />
    </aside>
  );
};

export default WorksheetPanel;