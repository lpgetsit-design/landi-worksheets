
CREATE TABLE public.worksheet_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_id uuid NOT NULL REFERENCES public.worksheets(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (worksheet_id, entity_type, entity_id)
);

ALTER TABLE public.worksheet_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view entities of own worksheets"
  ON public.worksheet_entities FOR SELECT TO authenticated
  USING (is_worksheet_owner(worksheet_id, auth.uid()));

CREATE POLICY "Users can insert entities of own worksheets"
  ON public.worksheet_entities FOR INSERT TO authenticated
  WITH CHECK (is_worksheet_owner(worksheet_id, auth.uid()));

CREATE POLICY "Users can delete entities of own worksheets"
  ON public.worksheet_entities FOR DELETE TO authenticated
  USING (is_worksheet_owner(worksheet_id, auth.uid()));
