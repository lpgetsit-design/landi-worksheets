CREATE TABLE public.summary_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  match_hints text,
  body text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT summary_prompts_owner_ck CHECK ((is_system AND user_id IS NULL) OR (NOT is_system AND user_id IS NOT NULL))
);

CREATE UNIQUE INDEX summary_prompts_name_key ON public.summary_prompts (lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.summary_prompts TO authenticated;
GRANT ALL ON public.summary_prompts TO service_role;
ALTER TABLE public.summary_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read system and own prompts" ON public.summary_prompts
  FOR SELECT TO authenticated USING (is_system OR user_id = auth.uid());
CREATE POLICY "Create own prompts" ON public.summary_prompts
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND is_system = false);
CREATE POLICY "Update own prompts" ON public.summary_prompts
  FOR UPDATE TO authenticated USING (user_id = auth.uid() AND is_system = false)
  WITH CHECK (user_id = auth.uid() AND is_system = false);
CREATE POLICY "Delete own prompts" ON public.summary_prompts
  FOR DELETE TO authenticated USING (user_id = auth.uid() AND is_system = false);

CREATE TRIGGER summary_prompts_updated_at BEFORE UPDATE ON public.summary_prompts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.transcripts
  ADD COLUMN summary_prompt_id uuid REFERENCES public.summary_prompts(id) ON DELETE SET NULL,
  ADD COLUMN summary_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN summary_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN summary_error text,
  ADD COLUMN classified_reason text,
  ADD COLUMN summarized_at timestamptz;

INSERT INTO public.summary_prompts (name, description, match_hints, body, is_system) VALUES
('Client Intake Call', 'Structured brief for a new role intake with a hiring manager or client.', 'intake, kickoff, new role, hiring manager, req briefing, client briefing', 'Summarise this recruiting intake conversation for the recruiter. Sections: "Meeting Context", "Role Requirements", "Process & Logistics", "Next Steps". Capture must-have skills, seniority, compensation band, location/hybrid rules, interview loop and owners of each action.', true),
('Candidate Screen', 'Candidate snapshot from a screening conversation.', 'candidate screen, phone screen, interview, candidate call, screening', 'Summarise this candidate screening conversation. Sections: "Candidate Snapshot", "Experience & Skills", "Motivation & Compensation", "Recruiter Assessment". Note current role, scope, reason for moving, salary expectations, notice period, and any risks or red flags.', true),
('Internal Pipeline Review', 'Internal team meeting on pipeline, statuses and risks.', 'pipeline, standup, weekly review, internal sync, team meeting, forecast', 'Summarise this internal recruiting team meeting. Sections: "Pipeline Status", "Risks", "Actions". Attribute each action to a named owner and include dates where mentioned.', true),
('Offer & Closing Call', 'Offer negotiation or closing conversation with a candidate.', 'offer, closing, negotiation, counter offer, start date, resignation', 'Summarise this offer or closing conversation. Sections: "Offer Conversation", "Open Concerns", "Actions". Capture the numbers discussed, objections, competing offers and commitments made by each side.', true),
('Client Debrief', 'Feedback debrief with a client after interviews.', 'debrief, client feedback, interview feedback, post-interview, rejection reason', 'Summarise this client debrief. Sections: "Client Debrief", "Feedback by Candidate", "Search Adjustment". Be explicit about why candidates advanced or were rejected and how the search criteria should change.', true),
('General Conversation', 'Fallback summary for conversations that do not match a specific type.', 'fallback, other, miscellaneous, general', 'Summarise this conversation for a recruiter. Sections: "Conversation Highlights", "Decisions", "Next Steps". Keep bullets short and factual.', true);