

## Plan: Worksheet Entity Associations

### Overview
Create a junction table `worksheet_entities` to track which CRM entities are referenced in each worksheet. Sync entities on every save, and add an entity filter on the Dashboard.

### 1. Database Migration

Create `worksheet_entities` table:

```sql
CREATE TABLE public.worksheet_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_id uuid NOT NULL REFERENCES public.worksheets(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (worksheet_id, entity_type, entity_id)
);

ALTER TABLE public.worksheet_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view entities of own worksheets"
  ON public.worksheet_entities FOR SELECT TO authenticated
  USING (is_worksheet_owner(worksheet_id, auth.uid()));

CREATE POLICY "Users can manage entities of own worksheets"
  ON public.worksheet_entities FOR ALL TO authenticated
  USING (is_worksheet_owner(worksheet_id, auth.uid()))
  WITH CHECK (is_worksheet_owner(worksheet_id, auth.uid()));
```

### 2. Sync Entities on Save (`src/lib/worksheets.ts`)

Add a `syncWorksheetEntities(worksheetId, contentJson)` function that:
- Walks the TipTap JSON tree to extract all `crmBadge` nodes (entityType, entityId, label)
- Deletes existing entities for that worksheet
- Inserts the current set in one batch
- Called from the editor's `onUpdate` debounce alongside the existing `updateWorksheet` call

### 3. Dashboard Filter (`src/pages/Dashboard.tsx`)

- Fetch distinct entities across user's worksheets (query `worksheet_entities` grouped by entity_type + entity_id + label)
- Add a searchable combobox/select filter for entity associations
- When an entity is selected, filter worksheets to only those with a matching row in `worksheet_entities`
- This requires joining or sub-querying; simplest approach: fetch all `worksheet_entities` for the user, build a map of worksheet_id → entities, then filter client-side

### 4. Files Changed

| File | Change |
|------|--------|
| Migration SQL | New `worksheet_entities` table + RLS |
| `src/lib/worksheets.ts` | Add `syncWorksheetEntities()` helper |
| `src/components/editor/WorksheetEditor.tsx` | Call `syncWorksheetEntities` in the save debounce |
| `src/pages/Dashboard.tsx` | Add entity filter dropdown, fetch entity data |

