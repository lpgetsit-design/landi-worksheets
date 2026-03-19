
-- Public share links table
CREATE TABLE public.public_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_id uuid NOT NULL REFERENCES public.worksheets(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  recipient_name text NOT NULL,
  recipient_email text,
  recipient_company text,
  share_token text UNIQUE NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Share link views table
CREATE TABLE public.share_link_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id uuid NOT NULL REFERENCES public.public_share_links(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  viewer_ip text,
  user_agent text,
  duration_seconds integer
);

-- Enable RLS
ALTER TABLE public.public_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_link_views ENABLE ROW LEVEL SECURITY;

-- RLS: Owners can manage their own share links
CREATE POLICY "Owners can select own share links"
  ON public.public_share_links FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Owners can insert own share links"
  ON public.public_share_links FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Owners can update own share links"
  ON public.public_share_links FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Owners can delete own share links"
  ON public.public_share_links FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- RLS: Anon can select by share_token (needed for edge function fallback)
CREATE POLICY "Anon can select by token"
  ON public.public_share_links FOR SELECT
  TO anon
  USING (true);

-- RLS: Views - anon can insert (logging), owners can read
CREATE POLICY "Anyone can insert views"
  ON public.share_link_views FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Owners can view analytics"
  ON public.share_link_views FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.public_share_links sl
      WHERE sl.id = share_link_id AND sl.created_by = auth.uid()
    )
  );
