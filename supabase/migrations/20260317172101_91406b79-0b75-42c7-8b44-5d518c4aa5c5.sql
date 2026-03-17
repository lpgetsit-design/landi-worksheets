CREATE OR REPLACE FUNCTION public.upsert_worksheet_embedding(
  _worksheet_id uuid,
  _embedding vector(1536),
  _content_hash text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.worksheet_embeddings (worksheet_id, embedding, content_hash)
  VALUES (_worksheet_id, _embedding, _content_hash)
  ON CONFLICT (worksheet_id)
  DO UPDATE SET embedding = EXCLUDED.embedding, content_hash = EXCLUDED.content_hash, created_at = now();
END;
$$;