
-- Workflow cards projection table
CREATE TABLE public.workflow_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_id uuid NOT NULL REFERENCES public.worksheets(id) ON DELETE CASCADE,
  card_node_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  description text,
  status text NOT NULL DEFAULT 'backlog',
  priority text DEFAULT 'medium',
  assignee_id text,
  assignee_label text,
  due_date timestamptz,
  labels jsonb DEFAULT '[]',
  lane_stage_key text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.workflow_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own worksheet cards" ON public.workflow_cards
  FOR ALL TO authenticated
  USING (is_worksheet_owner(worksheet_id, auth.uid()))
  WITH CHECK (is_worksheet_owner(worksheet_id, auth.uid()));

-- Workflow lanes projection table
CREATE TABLE public.workflow_lanes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_id uuid NOT NULL REFERENCES public.worksheets(id) ON DELETE CASCADE,
  lane_node_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  stage_key text NOT NULL,
  wip_limit integer,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.workflow_lanes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own worksheet lanes" ON public.workflow_lanes
  FOR ALL TO authenticated
  USING (is_worksheet_owner(worksheet_id, auth.uid()))
  WITH CHECK (is_worksheet_owner(worksheet_id, auth.uid()));
