import { useRef, useCallback } from "react";
import { Upload, Sparkles, Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useWorksheetAttachments } from "@/hooks/useWorksheetAttachments";
import AttachmentCard from "./AttachmentCard";
import type { Attachment } from "@/lib/attachments";
import { toast } from "sonner";

interface AttachmentPanelProps {
  worksheetId: string;
  userId: string;
  onInsertBadge: (attachment: Attachment) => void;
}

export default function AttachmentPanel({
  worksheetId,
  userId,
  onInsertBadge,
}: AttachmentPanelProps) {
  const {
    attachments,
    isLoading,
    upload,
    isUploading,
    remove,
    update,
    generateMetadata,
    isGenerating,
  } = useWorksheetAttachments(worksheetId, userId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      for (const file of Array.from(files)) {
        try {
          await upload(file);
        } catch {
          // toast already handled by hook
        }
      }
    },
    [upload]
  );

  const handleGenerateAll = useCallback(async () => {
    const pending = attachments.filter((a) => !a.title || a.title === a.file_name);
    if (pending.length === 0) {
      toast.info("All attachments already have AI-generated metadata");
      return;
    }
    for (const a of pending) {
      try {
        await generateMetadata(a);
      } catch {
        // individual errors toasted by hook
      }
    }
  }, [attachments, generateMetadata]);

  return (
    <Collapsible defaultOpen={false}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-foreground/80">
          <Paperclip className="h-3.5 w-3.5" />
          Attachments
          {attachments.length > 0 && (
            <span className="text-xs text-muted-foreground">({attachments.length})</span>
          )}
        </CollapsibleTrigger>
        <div className="flex items-center gap-1">
          {attachments.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={handleGenerateAll}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              AI All
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Upload className="h-3 w-3" />
            )}
            Upload
          </Button>
        </div>
      </div>

      <CollapsibleContent>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : attachments.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-6 gap-2 text-muted-foreground cursor-pointer hover:bg-accent/30 transition-colors mx-3 my-2 rounded-md border border-dashed border-border"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-5 w-5" />
            <p className="text-xs">Drop files here or click to upload</p>
          </div>
        ) : (
          <div className="p-2 space-y-2 max-h-[300px] overflow-y-auto">
            {attachments.map((a) => (
              <AttachmentCard
                key={a.id}
                attachment={a}
                onDelete={() => remove(a)}
                onUpdate={(updates) => update({ id: a.id, updates })}
                onGenerateMetadata={() => generateMetadata(a)}
                onInsertBadge={() => onInsertBadge(a)}
                isGenerating={isGenerating}
              />
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
