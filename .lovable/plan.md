

## Add Document Type Field to Worksheets

### Database Migration

1. Create an enum `document_type` with values: `note`, `skill`, `prompt`, `template`
2. Add a `document_type` column to the `worksheets` table, defaulting to `note`, not nullable

```sql
CREATE TYPE public.document_type AS ENUM ('note', 'skill', 'prompt', 'template');
ALTER TABLE public.worksheets ADD COLUMN document_type public.document_type NOT NULL DEFAULT 'note';
```

### Code Changes

1. **`src/lib/worksheets.ts`** — Update `Worksheet` interface to include `document_type`, update `createWorksheet` to accept optional `document_type` parameter
2. **`src/components/editor/WorksheetEditor.tsx`** — Add a document type selector (dropdown) near the title, save changes on selection
3. **`src/pages/Dashboard.tsx`** — Show document type badge on each worksheet card

The types file will auto-regenerate after migration.

