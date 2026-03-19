import { supabase } from "@/integrations/supabase/client";

export interface Attachment {
  id: string;
  worksheet_id: string;
  user_id: string;
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  title: string;
  description: string;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function fetchAttachments(worksheetId: string): Promise<Attachment[]> {
  const { data, error } = await supabase
    .from("worksheet_attachments")
    .select("*")
    .eq("worksheet_id", worksheetId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Attachment[];
}

export async function uploadAttachment(
  worksheetId: string,
  userId: string,
  file: File
): Promise<Attachment> {
  const filePath = `${userId}/${worksheetId}/${crypto.randomUUID()}_${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from("attachments")
    .upload(filePath, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("worksheet_attachments")
    .insert({
      worksheet_id: worksheetId,
      user_id: userId,
      file_path: filePath,
      file_name: file.name,
      file_type: file.type || "application/octet-stream",
      file_size: file.size,
    })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as Attachment;
}

/** Get a signed URL valid for 1 hour (private bucket) */
export async function getSignedUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(filePath, 3600); // 1 hour
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteAttachment(attachment: Attachment) {
  await supabase.storage.from("attachments").remove([attachment.file_path]);
  const { error } = await supabase
    .from("worksheet_attachments")
    .delete()
    .eq("id", attachment.id);
  if (error) throw error;
}

export async function updateAttachmentMeta(
  id: string,
  updates: { title?: string; description?: string }
) {
  const { error } = await supabase
    .from("worksheet_attachments")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

export async function generateAttachmentMetadata(attachment: Attachment) {
  // Pass file_path so edge function can create its own signed URL with service role
  const { data, error } = await supabase.functions.invoke("attachment-metadata", {
    body: {
      attachmentId: attachment.id,
      fileName: attachment.file_name,
      fileType: attachment.file_type,
      filePath: attachment.file_path,
    },
  });
  if (error) throw error;
  return data as { title: string; description: string };
}
