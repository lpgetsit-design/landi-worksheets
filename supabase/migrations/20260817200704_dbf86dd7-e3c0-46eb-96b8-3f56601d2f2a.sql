CREATE TABLE public.transcripts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('upload','teams','ringcentral')),
  title text NOT NULL,
  external_id text,
  occurred_at timestamptz,
  duration_seconds integer,
  participants jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_text text,
  segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','processing','failed')),
  provider_job_id text,
  error_message text,
  file_path text,
  file_name text,
  file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX transcripts_user_source_external_idx ON public.transcripts (user_id, source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX transcripts_user_created_idx ON public.transcripts (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transcripts TO authenticated;
GRANT ALL ON public.transcripts TO service_role;
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their transcripts" ON public.transcripts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.user_integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('microsoft','ringcentral')),
  external_user_id text,
  external_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_integrations TO authenticated;
GRANT ALL ON public.user_integrations TO service_role;
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their integrations" ON public.user_integrations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_transcripts_updated_at BEFORE UPDATE ON public.transcripts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_integrations_updated_at BEFORE UPDATE ON public.user_integrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Owners read own transcript files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'transcripts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Owners upload own transcript files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'transcripts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Owners update own transcript files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'transcripts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Owners delete own transcript files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'transcripts' AND auth.uid()::text = (storage.foldername(name))[1]);