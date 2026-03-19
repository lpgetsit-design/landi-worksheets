-- Create storage bucket for attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', true);

-- Storage RLS: authenticated users can upload
CREATE POLICY "Authenticated users can upload attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'attachments');

-- Storage RLS: anyone can view (public bucket)
CREATE POLICY "Anyone can view attachments"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'attachments');

-- Storage RLS: owners can delete their uploads
CREATE POLICY "Users can delete own attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Create worksheet_attachments table
CREATE TABLE public.worksheet_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_id uuid NOT NULL REFERENCES public.worksheets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL DEFAULT '',
  file_size bigint NOT NULL DEFAULT 0,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.worksheet_attachments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can insert own worksheet attachments"
ON public.worksheet_attachments FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND is_worksheet_owner(worksheet_id, auth.uid()));

CREATE POLICY "Users can view own worksheet attachments"
ON public.worksheet_attachments FOR SELECT TO authenticated
USING (is_worksheet_owner(worksheet_id, auth.uid()));

CREATE POLICY "Users can update own worksheet attachments"
ON public.worksheet_attachments FOR UPDATE TO authenticated
USING (is_worksheet_owner(worksheet_id, auth.uid()));

CREATE POLICY "Users can delete own worksheet attachments"
ON public.worksheet_attachments FOR DELETE TO authenticated
USING (is_worksheet_owner(worksheet_id, auth.uid()));

-- Auto-update updated_at
CREATE TRIGGER update_worksheet_attachments_updated_at
  BEFORE UPDATE ON public.worksheet_attachments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();