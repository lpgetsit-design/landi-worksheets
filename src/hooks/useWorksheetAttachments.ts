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

  const aiMetadataMutation = useMutation({
    mutationFn: ({ attachment, field }: { attachment: Attachment; field: "title" | "description" | "both" }) =>
      generateAttachmentMetadata(attachment, field),
    onSuccess: (_data, { field }) => {
      qc.invalidateQueries({ queryKey: key });
      const label = field === "both" ? "metadata" : field;
      toast.success(`AI ${label} generated`);
    },
    onError: (e: Error) => toast.error(`AI generation failed: ${e.message}`),
  });

  return {
    attachments: query.data ?? [],
    isLoading: query.isLoading,
    upload: uploadMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
    remove: deleteMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    generateMetadata: aiMetadataMutation.mutateAsync,
    isGenerating: aiMetadataMutation.isPending,
  };
}
