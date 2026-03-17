-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Create embeddings table
CREATE TABLE public.worksheet_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_id uuid NOT NULL REFERENCES public.worksheets(id) ON DELETE CASCADE,
  embedding extensions.vector(1536) NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (worksheet_id)
);

-- Enable RLS
ALTER TABLE public.worksheet_embeddings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own worksheet embeddings"
  ON public.worksheet_embeddings FOR SELECT TO authenticated
  USING (is_worksheet_owner(worksheet_id, auth.uid()));

CREATE POLICY "Users can insert own worksheet embeddings"
  ON public.worksheet_embeddings FOR INSERT TO authenticated
  WITH CHECK (is_worksheet_owner(worksheet_id, auth.uid()));

CREATE POLICY "Users can update own worksheet embeddings"
  ON public.worksheet_embeddings FOR UPDATE TO authenticated
  USING (is_worksheet_owner(worksheet_id, auth.uid()));

CREATE POLICY "Users can delete own worksheet embeddings"
  ON public.worksheet_embeddings FOR DELETE TO authenticated
  USING (is_worksheet_owner(worksheet_id, auth.uid()));

-- HNSW index for fast similarity search
CREATE INDEX worksheet_embeddings_embedding_idx
  ON public.worksheet_embeddings
  USING hnsw (embedding extensions.vector_cosine_ops);
