-- 1. Add session_id + status to worksheets
ALTER TABLE public.worksheets
  ADD COLUMN IF NOT EXISTS session_id uuid NULL REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'saved';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='worksheets' AND constraint_name='worksheets_status_check'
  ) THEN
    ALTER TABLE public.worksheets
      ADD CONSTRAINT worksheets_status_check CHECK (status IN ('active','saved'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS worksheets_session_id_idx ON public.worksheets(session_id);

-- 2. worksheet_revisions table (mirror of chat_design_revisions)
CREATE TABLE IF NOT EXISTS public.worksheet_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_id uuid NOT NULL REFERENCES public.worksheets(id) ON DELETE CASCADE,
  revision_index integer NOT NULL,
  content_json jsonb NULL,
  content_md text NULL,
  content_html text NULL,
  prompt_message_id uuid NULL REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (worksheet_id, revision_index)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.worksheet_revisions TO authenticated;
GRANT ALL ON public.worksheet_revisions TO service_role;

ALTER TABLE public.worksheet_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage worksheet revisions"
  ON public.worksheet_revisions
  FOR ALL
  TO authenticated
  USING (public.is_worksheet_owner(worksheet_id, auth.uid()))
  WITH CHECK (public.is_worksheet_owner(worksheet_id, auth.uid()));

CREATE POLICY "Grantees can read worksheet revisions"
  ON public.worksheet_revisions
  FOR SELECT
  TO authenticated
  USING (public.has_worksheet_access(worksheet_id, auth.uid(), NULL));

CREATE INDEX IF NOT EXISTS worksheet_revisions_worksheet_idx
  ON public.worksheet_revisions(worksheet_id, revision_index);

-- 3. Backfill: every existing worksheet gets a hosting chat_sessions row + revision 0.
DO $$
DECLARE
  ws RECORD;
  new_session_id uuid;
BEGIN
  FOR ws IN
    SELECT id, user_id, title, content_json, content_md, content_html, updated_at
    FROM public.worksheets
    WHERE session_id IS NULL
  LOOP
    INSERT INTO public.chat_sessions (user_id, title, worksheet_id, created_at, updated_at)
    VALUES (ws.user_id, COALESCE(NULLIF(ws.title,''), 'Untitled worksheet'), NULL, ws.updated_at, ws.updated_at)
    RETURNING id INTO new_session_id;

    UPDATE public.worksheets
      SET session_id = new_session_id,
          status = 'saved'
      WHERE id = ws.id;

    INSERT INTO public.worksheet_revisions (worksheet_id, revision_index, content_json, content_md, content_html, created_at)
    VALUES (ws.id, 0, ws.content_json, ws.content_md, ws.content_html, ws.updated_at)
    ON CONFLICT (worksheet_id, revision_index) DO NOTHING;
  END LOOP;
END $$;