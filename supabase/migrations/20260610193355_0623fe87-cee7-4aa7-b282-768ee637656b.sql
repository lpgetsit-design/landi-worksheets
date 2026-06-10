
-- chat_sessions
CREATE TABLE public.chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_sessions TO authenticated;
GRANT ALL ON public.chat_sessions TO service_role;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions" ON public.chat_sessions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX chat_sessions_user_idx ON public.chat_sessions(user_id, updated_at DESC);
CREATE TRIGGER chat_sessions_updated_at BEFORE UPDATE ON public.chat_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ownership helper to avoid recursive policies
CREATE OR REPLACE FUNCTION public.is_chat_session_owner(_session_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_sessions s WHERE s.id = _session_id AND s.user_id = _user_id);
$$;

-- chat_messages
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  content text NOT NULL DEFAULT '',
  mentions jsonb NOT NULL DEFAULT '[]'::jsonb,
  tool_name text,
  tool_args jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own session messages" ON public.chat_messages
  FOR ALL TO authenticated
  USING (public.is_chat_session_owner(session_id, auth.uid()))
  WITH CHECK (public.is_chat_session_owner(session_id, auth.uid()));
CREATE INDEX chat_messages_session_idx ON public.chat_messages(session_id, created_at);

-- chat_designs
CREATE TABLE public.chat_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled design',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','saved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_designs TO authenticated;
GRANT ALL ON public.chat_designs TO service_role;
ALTER TABLE public.chat_designs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own session designs" ON public.chat_designs
  FOR ALL TO authenticated
  USING (public.is_chat_session_owner(session_id, auth.uid()))
  WITH CHECK (public.is_chat_session_owner(session_id, auth.uid()));
CREATE INDEX chat_designs_session_idx ON public.chat_designs(session_id, created_at);
-- enforce at most one active draft per session
CREATE UNIQUE INDEX chat_designs_one_active_per_session
  ON public.chat_designs(session_id) WHERE status = 'active';
CREATE TRIGGER chat_designs_updated_at BEFORE UPDATE ON public.chat_designs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_chat_design_owner(_design_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_designs d
    JOIN public.chat_sessions s ON s.id = d.session_id
    WHERE d.id = _design_id AND s.user_id = _user_id
  );
$$;

-- chat_design_revisions
CREATE TABLE public.chat_design_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES public.chat_designs(id) ON DELETE CASCADE,
  revision_index integer NOT NULL,
  html text NOT NULL,
  prompt_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (design_id, revision_index)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_design_revisions TO authenticated;
GRANT ALL ON public.chat_design_revisions TO service_role;
ALTER TABLE public.chat_design_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own design revisions" ON public.chat_design_revisions
  FOR ALL TO authenticated
  USING (public.is_chat_design_owner(design_id, auth.uid()))
  WITH CHECK (public.is_chat_design_owner(design_id, auth.uid()));
CREATE INDEX chat_design_revisions_design_idx ON public.chat_design_revisions(design_id, revision_index);
