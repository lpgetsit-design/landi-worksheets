CREATE TYPE public.document_type AS ENUM ('note', 'skill', 'prompt', 'template');
ALTER TABLE public.worksheets ADD COLUMN document_type public.document_type NOT NULL DEFAULT 'note';