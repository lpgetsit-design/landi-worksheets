## Plan: AI-Powered Keyword Extraction for Hybrid Document Search

### What We're Building

An automated keyword/tag extraction system that runs alongside the existing summary and embedding generation. When a worksheet is saved, an AI model will extract recruiting-domain-aware keywords and store them in the worksheet's `meta` column, enabling hybrid search (keywords + vector similarity).

### Architecture

```text
User edits worksheet
        │
        ▼  (5s debounce, alongside summary + embedding)
Edge Function: extract-keywords
        │
        ▼
AI extracts structured keywords from content
        │
        ▼
Keywords saved to worksheets.meta.keywords
```

### Changes

**1. New Edge Function: `supabase/functions/extract-keywords/index.ts**`

- Receives `worksheetId`, `title`, `content`, `documentType`
- Uses Lovable AI (`google/gemini-2.5-flash-lite`) — no extra API key needed
- Prompt instructs the model to extract keywords across recruiting domain categories:
  - **Entities**: candidate names, client/company names, job titles, IDs
  - **Skills & qualifications**: technical skills, certifications, degrees
  - **Domain tags**: front-office (sourcing, placement), middle-office (scheduling, formatting), back-office (accounting, HR, marketing)
  - **Actions/status**: interview scheduled, offer extended, invoice sent
  - **Identifiers**: CRM IDs, job req numbers, campaign names, report names
- Returns a flat JSON array of lowercase keyword strings, while making sure the keywords are nomalized so the tags are synced in terms of keywords
- Saves keywords + timestamp into `worksheets.meta.keywords` and `meta.keywords_updated_at` via service-role client

**2. New file: `supabase/functions/extract-keywords/deno.json**`

- Standard import map for the edge function

**3. Update `supabase/config.toml**`

- Add `[functions.extract-keywords]` with `verify_jwt = false`

**4. Update `src/lib/worksheets.ts**`

- Add `generateAndSaveKeywords()` helper that calls the edge function with auth token

**5. Update `src/components/editor/WorksheetEditor.tsx**`

- Add `generateAndSaveKeywords` call in the existing 5-second debounce timer alongside summary and embedding

### Keyword Extraction Prompt Strategy

The prompt will instruct the model to return 5-30 keywords as a JSON array, covering:

- People, companies, job titles mentioned
- Skills, technologies, certifications
- Recruiting workflow stages (sourcing, screening, onboarding, etc.)
- Document purpose (meeting notes, job description, client brief, invoice, campaign plan)
- Any IDs, codes, or reference numbers
- Industry/sector terms

This keeps keywords general enough to cover any recruiting business function while being specific enough for precise search.

### No Database Migration Needed

Keywords are stored in the existing `meta` JSONB column on `worksheets`, so no schema changes required.