import { useState } from "react";
import { Paperclip, Trash2, Sparkles, Loader2, FileText, Music, Video, Image, File, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { Attachment } from "@/lib/attachments";
import { getPublicUrl } from "@/lib/attachments";

function getFileIcon(fileType: string) {
  if (fileType.startsWith("image/")) return Image;
  if (fileType.startsWith("audio/")) return Music;
  if (fileType.startsWith("video/")) return Video;
  if (fileType.includes("pdf") || fileType.includes("word") || fileType.includes("text")) return FileText;
  return File;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AttachmentCardProps {
  attachment: Attachment;
  onDelete: () => void;
  onUpdate: (updates: { title?: string; description?: string }) => void;
  onGenerateMetadata: () => void;
  onInsertBadge: () => void;
  isGenerating: boolean;
}

export default function AttachmentCard({
  attachment,
  onDelete,
  onUpdate,
  onGenerateMetadata,
  onInsertBadge,
  isGenerating,
}: AttachmentCardProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [title, setTitle] = useState(attachment.title);
  const [description, setDescription] = useState(attachment.description);
  const Icon = getFileIcon(attachment.file_type);
  const publicUrl = getPublicUrl(attachment.file_path);
  const isImage = attachment.file_type.startsWith("image/");

  const saveTitle = () => {
    setEditingTitle(false);
    if (title !== attachment.title) onUpdate({ title });
  };

  const saveDesc = () => {
    setEditingDesc(false);
    if (description !== attachment.description) onUpdate({ description });
  };

  // Sync from props when AI generates
  if (attachment.title !== title && !editingTitle) setTitle(attachment.title);
  if (attachment.description !== description && !editingDesc) setDescription(attachment.description);

  return (
    <div className="flex gap-3 p-3 rounded-md border border-border bg-card hover:bg-accent/30 transition-colors">
      {/* Thumbnail / icon */}
      <div className="shrink-0 w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden">
        {isImage ? (
          <img src={publicUrl} alt={attachment.file_name} className="w-full h-full object-cover" />
        ) : (
          <Icon className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Title */}
        {editingTitle ? (
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === "Enter" && saveTitle()}
            className="h-6 text-sm px-1 py-0"
            autoFocus
          />
        ) : (
          <p
            className="text-sm font-medium text-foreground truncate cursor-pointer hover:underline"
            onClick={() => setEditingTitle(true)}
            title="Click to edit title"
          >
            {title || attachment.file_name}
          </p>
        )}

        {/* Description */}
        {editingDesc ? (
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={saveDesc}
            className="text-xs min-h-[40px] px-1 py-0.5"
            autoFocus
          />
        ) : (
          <p
            className="text-xs text-muted-foreground line-clamp-2 cursor-pointer hover:underline"
            onClick={() => setEditingDesc(true)}
            title="Click to edit description"
          >
            {description || "Click to add description…"}
          </p>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[10px] px-1 py-0">
            {attachment.file_type.split("/")[1]?.toUpperCase() || "FILE"}
          </Badge>
          <span className="text-[10px] text-muted-foreground">{formatSize(attachment.file_size)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="shrink-0 flex flex-col gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onGenerateMetadata}
          disabled={isGenerating}
          title="AI generate title & description"
        >
          {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onInsertBadge}
          title="Insert into editor"
        >
          <ArrowUpRight className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          title="Delete attachment"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => window.open(publicUrl, "_blank")}
          title="Open file"
        >
          <Paperclip className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
