-- 1) space_folders table
CREATE TABLE public.space_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid NULL REFERENCES public.space_folders(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.space_folders TO authenticated;
GRANT ALL ON public.space_folders TO service_role;

ALTER TABLE public.space_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own folders"
  ON public.space_folders
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX space_folders_user_parent_idx
  ON public.space_folders (user_id, parent_id);

CREATE TRIGGER update_space_folders_updated_at
  BEFORE UPDATE ON public.space_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Add folder_id to worksheets and chat_designs
ALTER TABLE public.worksheets
  ADD COLUMN folder_id uuid NULL REFERENCES public.space_folders(id) ON DELETE SET NULL;

CREATE INDEX worksheets_folder_idx ON public.worksheets (folder_id);

ALTER TABLE public.chat_designs
  ADD COLUMN folder_id uuid NULL REFERENCES public.space_folders(id) ON DELETE SET NULL;

CREATE INDEX chat_designs_folder_idx ON public.chat_designs (folder_id);