
DROP FUNCTION IF EXISTS public.hybrid_search_worksheets(vector(1536), text[], uuid, int);

CREATE OR REPLACE FUNCTION public.hybrid_search_worksheets(
  _query_embedding vector(1536),
  _query_keywords text[],
  _user_id uuid,
  _match_count int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  title text,
  document_type text,
  content_md text,
  meta jsonb,
  updated_at timestamptz,
  created_at timestamptz,
  similarity_score float,
  keyword_score float,
  combined_score float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    w.id,
    w.title,
    w.document_type::text,
    w.content_md,
    w.meta,
    w.updated_at,
    w.created_at,
    COALESCE(1 - (we.embedding <=> _query_embedding), 0)::float AS similarity_score,
    CASE
      WHEN array_length(_query_keywords, 1) IS NULL OR array_length(_query_keywords, 1) = 0 THEN 0
      ELSE COALESCE(
        (SELECT COUNT(*)::float FROM unnest(_query_keywords) qk
         WHERE qk = ANY(
           ARRAY(SELECT jsonb_array_elements_text(COALESCE(w.meta->'keywords', '[]'::jsonb)))
         ))
        / array_length(_query_keywords, 1)::float,
        0
      )
    END::float AS keyword_score,
    (
      COALESCE(1 - (we.embedding <=> _query_embedding), 0) * 0.6 +
      CASE
        WHEN array_length(_query_keywords, 1) IS NULL OR array_length(_query_keywords, 1) = 0 THEN 0
        ELSE COALESCE(
          (SELECT COUNT(*)::float FROM unnest(_query_keywords) qk
           WHERE qk = ANY(
             ARRAY(SELECT jsonb_array_elements_text(COALESCE(w.meta->'keywords', '[]'::jsonb)))
           ))
          / array_length(_query_keywords, 1)::float,
          0
        )
      END * 0.4
    )::float AS combined_score
  FROM public.worksheets w
  LEFT JOIN public.worksheet_embeddings we ON we.worksheet_id = w.id
  WHERE w.user_id = _user_id
  ORDER BY combined_score DESC
  LIMIT _match_count;
END;
$$;
