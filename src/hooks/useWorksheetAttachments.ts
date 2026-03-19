import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchAttachments,
  uploadAttachment,
  deleteAttachment,
  updateAttachmentMeta,
  generateAttachmentMetadata,
  type Attachment,
} from "@/lib/attachments";
import { toast } from "sonner";

export function useWorksheetAttachments(worksheetId: string, userId?: string) {
  const qc = useQueryClient();
  const key = ["worksheet-attachments", worksheetId];
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchAttachments(worksheetId),
    enabled: !!worksheetId,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      if (!userId) throw new Error("Not authenticated");
      return uploadAttachment(worksheetId, userId, file);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("File uploaded");
    },
    onError: (e: Error) => toast.error(`Upload failed: ${e.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (attachment: Attachment) => deleteAttachment(attachment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Attachment deleted");
    },
    onError: (e: Error) => toast.error(`Delete failed: ${e.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: { title?: string; description?: string } }) =>
      updateAttachmentMeta(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const generateMetadata = useCallback(
    async (attachment: Attachment, field: "title" | "description" | "both" = "both") => {
      const k = `${attachment.id}:${field}`;
      setGeneratingKey(k);
      try {
        await generateAttachmentMetadata(attachment, field);
        qc.invalidateQueries({ queryKey: key });
        const label = field === "both" ? "metadata" : field;
        toast.success(`AI ${label} generated`);
      } catch (e: any) {
        toast.error(`AI generation failed: ${e.message}`);
      } finally {
        setGeneratingKey(null);
      }
    },
    [qc, key]
  );

  return {
    attachments: query.data ?? [],
    isLoading: query.isLoading,
    upload: uploadMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
    remove: deleteMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    generateMetadata,
    generatingKey,
  };
}
