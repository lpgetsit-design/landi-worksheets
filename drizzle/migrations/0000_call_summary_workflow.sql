ALTER TABLE public.summary_prompts
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS detect_when text,
  ADD COLUMN IF NOT EXISTS sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS distinct_from text,
  ADD COLUMN IF NOT EXISTS category_group text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 1000;
ALTER TABLE public.summary_prompts ALTER COLUMN body SET DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS summary_prompts_slug_key ON public.summary_prompts (slug);

ALTER TABLE public.transcripts
  ADD COLUMN IF NOT EXISTS summary_overview text,
  ADD COLUMN IF NOT EXISTS summary_next_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS summary_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS summary_detection jsonb,
  ADD COLUMN IF NOT EXISTS summary_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS summary_started_at timestamptz;

DELETE FROM public.summary_prompts WHERE is_system;

UPDATE public.transcripts SET summary_status = 'pending'
 WHERE status = 'ready' AND summary_prompt_id IS NULL AND summary_status IN ('ready','failed');

CREATE OR REPLACE FUNCTION public.validate_call_type()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE
  s jsonb; n int; titles text[] := '{}'; t text; f text; total int;
BEGIN
  IF NEW.is_system THEN RETURN NEW; END IF;
  IF coalesce(btrim(NEW.name),'') = '' OR length(NEW.name) > 60 THEN RAISE EXCEPTION 'Call type needs a name of up to 60 characters'; END IF;
  IF lower(btrim(NEW.name)) IN ('general','call overview','next steps') THEN RAISE EXCEPTION 'That name is reserved'; END IF;
  IF coalesce(btrim(NEW.detect_when),'') = '' OR length(NEW.detect_when) > 300 THEN RAISE EXCEPTION 'Call type needs a yes/no "detect when" question (up to 300 characters)'; END IF;
  IF length(coalesce(NEW.notes,'')) > 600 THEN RAISE EXCEPTION 'Notes must be under 600 characters'; END IF;
  IF jsonb_typeof(NEW.sections) <> 'array' THEN RAISE EXCEPTION 'Sections must be a list'; END IF;
  n := jsonb_array_length(NEW.sections);
  IF n < 1 OR n > 4 THEN RAISE EXCEPTION 'A call type needs 1 to 4 sections'; END IF;
  FOR s IN SELECT * FROM jsonb_array_elements(NEW.sections) LOOP
    t := lower(btrim(coalesce(s->>'title','')));
    f := s->>'format';
    IF t = '' THEN RAISE EXCEPTION 'Every section needs a title'; END IF;
    IF t IN ('call overview','overview','next steps') THEN RAISE EXCEPTION 'Call overview and Next steps are written by Landi — remove that section'; END IF;
    IF t = ANY(titles) THEN RAISE EXCEPTION 'Section titles must be unique (%)', s->>'title'; END IF;
    titles := titles || t;
    IF f IS NULL OR f NOT IN ('bullets','table','key_value','checklist','paragraph') THEN RAISE EXCEPTION 'Section "%" has an unknown format', s->>'title'; END IF;
    IF f = 'table' AND coalesce(jsonb_array_length(s->'columns'),0) < 1 THEN RAISE EXCEPTION 'Table section "%" needs columns', s->>'title'; END IF;
    IF f = 'key_value' AND coalesce(jsonb_array_length(s->'keys'),0) < 1 THEN RAISE EXCEPTION 'Key details section "%" needs keys', s->>'title'; END IF;
    IF length(coalesce(s->>'instructions','')) > 1200 THEN RAISE EXCEPTION 'Instructions for "%" are too long', s->>'title'; END IF;
    IF coalesce(s->>'instructions','') ~* '(ignore|disregard|override).{0,40}(rules|frame|instructions)|call overview|next steps' THEN
      RAISE EXCEPTION 'Instructions for "%" try to change the summary frame', s->>'title';
    END IF;
  END LOOP;
  total := length(NEW.sections::text) + length(coalesce(NEW.notes,'')) + length(NEW.detect_when);
  IF total > 4000 THEN RAISE EXCEPTION 'Call type is too long — keep it to about 3,000 characters'; END IF;
  IF coalesce(NEW.notes,'') ~* '(ignore|disregard|override).{0,40}(rules|frame|instructions)|call overview|next steps' THEN
    RAISE EXCEPTION 'Notes try to change the summary frame';
  END IF;
  NEW.slug := NULL;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS summary_prompts_validate ON public.summary_prompts;
CREATE TRIGGER summary_prompts_validate BEFORE INSERT OR UPDATE ON public.summary_prompts
  FOR EACH ROW EXECUTE FUNCTION public.validate_call_type();