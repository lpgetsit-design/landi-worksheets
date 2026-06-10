
ALTER TABLE public.public_share_links 
  ALTER COLUMN worksheet_id DROP NOT NULL,
  ADD COLUMN chat_design_id uuid REFERENCES public.chat_designs(id) ON DELETE CASCADE;

ALTER TABLE public.public_share_links
  ADD CONSTRAINT public_share_links_target_check
  CHECK (
    (worksheet_id IS NOT NULL AND chat_design_id IS NULL) OR
    (worksheet_id IS NULL AND chat_design_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS public_share_links_chat_design_id_idx 
  ON public.public_share_links(chat_design_id);
