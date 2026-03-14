
-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Worksheets table
CREATE TABLE public.worksheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled',
  content_json JSONB,
  content_html TEXT,
  content_md TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.worksheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own worksheets" ON public.worksheets FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can create own worksheets" ON public.worksheets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own worksheets" ON public.worksheets FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own worksheets" ON public.worksheets FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_worksheets_updated_at BEFORE UPDATE ON public.worksheets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Worksheet versions table
CREATE TABLE public.worksheet_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_id UUID NOT NULL REFERENCES public.worksheets(id) ON DELETE CASCADE,
  content_json JSONB,
  content_html TEXT,
  content_md TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.worksheet_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view versions of own worksheets" ON public.worksheet_versions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.worksheets WHERE id = worksheet_id AND user_id = auth.uid()));
CREATE POLICY "Users can create versions of own worksheets" ON public.worksheet_versions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.worksheets WHERE id = worksheet_id AND user_id = auth.uid()));

-- Permission enum and access grants table
CREATE TYPE public.worksheet_permission AS ENUM ('read', 'write');

CREATE TABLE public.worksheet_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_id UUID NOT NULL REFERENCES public.worksheets(id) ON DELETE CASCADE,
  granted_to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission worksheet_permission NOT NULL DEFAULT 'read',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (worksheet_id, granted_to_user_id)
);
ALTER TABLE public.worksheet_access_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage access grants" ON public.worksheet_access_grants FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.worksheets WHERE id = worksheet_id AND user_id = auth.uid()));
CREATE POLICY "Granted users can view their grants" ON public.worksheet_access_grants FOR SELECT TO authenticated
  USING (granted_to_user_id = auth.uid());

-- Allow granted users to view shared worksheets
CREATE POLICY "Granted users can view shared worksheets" ON public.worksheets FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.worksheet_access_grants WHERE worksheet_id = id AND granted_to_user_id = auth.uid()));
CREATE POLICY "Granted write users can update shared worksheets" ON public.worksheets FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.worksheet_access_grants WHERE worksheet_id = id AND granted_to_user_id = auth.uid() AND permission = 'write'));

-- Indexes
CREATE INDEX idx_worksheets_user_id ON public.worksheets(user_id);
CREATE INDEX idx_worksheet_versions_worksheet_id ON public.worksheet_versions(worksheet_id);
CREATE INDEX idx_worksheet_access_grants_granted_to ON public.worksheet_access_grants(granted_to_user_id);
CREATE INDEX idx_worksheet_access_grants_worksheet ON public.worksheet_access_grants(worksheet_id);
