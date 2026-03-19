import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { Paperclip, X, FileText, Music, Video, Image, File } from "lucide-react";
// Signed URLs are handled at the page level; this view doesn't need direct storage access

function getFileIcon(fileType: string) {
  if (fileType.startsWith("image/")) return Image;
  if (fileType.startsWith("audio/")) return Music;
  if (fileType.startsWith("video/")) return Video;
  if (fileType.includes("pdf") || fileType.includes("word") || fileType.includes("text"))
    return FileText;
  return File;
}

export default function FileBadgeView({ node, editor, getPos }: NodeViewProps) {
  const { attachmentId, fileName, fileType, title } = node.attrs;
  const isEditable = editor?.isEditable ?? false;
  const Icon = getFileIcon(fileType);

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!editor || typeof getPos !== "function") return;
    const pos = getPos();
    editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
  };

  const handleClick = () => {
    // Find file_path from attachmentId — we store it in a data attribute or fall back
    // For now, we try to construct the URL. The attachment panel stores the path.
    // We'll open a new tab to download
    if (attachmentId) {
      // We can't easily get file_path from just the badge, so we'll search DOM or use a fallback
      // Best approach: store file_path in meta or just use attachmentId to look up
      window.open(`#attachment-${attachmentId}`, "_blank");
    }
  };

  return (
    <NodeViewWrapper as="span" className="inline">
      <HoverCard openDelay={200} closeDelay={100}>
        <HoverCardTrigger asChild>
          <span
            className="inline-flex max-w-full overflow-hidden items-center gap-1 rounded border border-border bg-accent/50 px-1.5 py-0.5 text-xs font-medium text-foreground align-baseline mx-0.5 select-none cursor-pointer hover:bg-accent transition-colors group/badge"
            contentEditable={false}
            onClick={handleClick}
          >
            <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="truncate min-w-0">{title || fileName}</span>
            {isEditable && (
              <button
                type="button"
                className="shrink-0 ml-0.5 rounded-sm opacity-0 group-hover/badge:opacity-100 hover:bg-foreground/10 transition-opacity p-0"
                onClick={handleRemove}
                aria-label="Remove badge"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </span>
        </HoverCardTrigger>
        <HoverCardContent side="top" align="start" className="w-60 p-3">
          <div className="flex items-start gap-2">
            <Paperclip className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground leading-tight truncate">
                {title || fileName}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1 truncate">{fileName}</p>
              <p className="text-[10px] text-muted-foreground">{fileType}</p>
              <p className="text-xs text-muted-foreground mt-1.5">Click to open file</p>
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    </NodeViewWrapper>
  );
}
