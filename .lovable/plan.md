

## Auto-summarize worksheet on every change

### Approach

When worksheet content is saved (the existing 500ms debounce in `onUpdate`), we'll add a **second, longer debounce** (e.g. 5 seconds of inactivity) that calls a new edge function to generate an AI summary. The summary gets stored in `meta.summary` on the worksheets table — no schema migration needed since `meta` is already a JSONB column.

### Why a separate debounce

Content saves happen every 500ms of idle time. We don't want to call the AI on every keystroke pause — a 5-second idle debounce ensures the user has paused meaningfully before triggering summarization.

### Changes

**1. New edge function: `supabase/functions/summarize-worksheet/index.ts`**
- Accepts `{ worksheetId, content, title, documentType }`
- Calls Lovable AI Gateway (gemini-3-flash-preview) with a system prompt:
  - "Summarize this worksheet in ≤500 words. Preserve the main context, background, key points, and any CRM entity references."
- Returns `{ summary: string }`
- Uses `LOVABLE_API_KEY` (already available)
- Non-streaming (simple invoke, no SSE needed)

**2. New helper in `src/lib/worksheets.ts`: `generateAndSaveSummary()`**
- Calls the edge function with the current markdown content
- On success, reads current `meta`, merges `{ summary, summary_updated_at }`, and updates the worksheet

**3. Update `src/components/editor/WorksheetEditor.tsx`**
- Add a second `useRef` for the summary debounce timer (5 seconds)
- In `onUpdate`, after the existing 500ms save timeout, reset the 5-second summary timer
- When it fires, call `generateAndSaveSummary()` in the background (fire-and-forget, no UI blocking)
- Clean up the timer on unmount

**4. Update `supabase/config.toml`** — not needed, auto-handled on deploy.

### Data shape in `meta`

```json
{
  "linked_worksheets": [...],
  "summary": "This worksheet covers...",
  "summary_updated_at": "2026-03-17T..."
}
```

### Edge function prompt design

```
You are a document summarizer. Given a worksheet's title, type, and content,
produce a concise summary (max 500 words) that preserves:
- The main topic and context
- Key background information
- Important details, decisions, or action items
- Any referenced people, companies, or entities

Do NOT add information not present in the original. Return only the summary text.
```

### No schema migration required

The `meta` JSONB column already exists and is used for `linked_worksheets`. We simply add `summary` and `summary_updated_at` keys alongside it.

