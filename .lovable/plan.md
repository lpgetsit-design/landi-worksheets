

## Plan: Preserve CRM Badges Through AI Edits

### Problem
When worksheet content is sent to the AI chat, CRM badges are converted to plain markdown by Turndown, losing all structured data (entityType, entityId, label, metadata). When the AI returns modified content, badges disappear.

### Solution
Introduce a custom badge placeholder syntax that survives the markdown round-trip, and teach the AI to preserve it.

### Changes

**1. Custom badge syntax for AI context**

Define a placeholder format: `[[CRM:entityType:entityId:label]]`
- Example: `[[CRM:Candidate:12345:John Smith]]`
- This is what the AI sees in the worksheet content and must preserve verbatim.

**2. Serialize badges when building AI context (`WorksheetEditor.tsx` / `WorksheetPage.tsx`)**

Instead of using raw Turndown markdown (which strips badge nodes), walk the TipTap JSON to extract CRM badges and replace them with the placeholder syntax in the markdown sent to the AI via `onContentChange`.

- Create a utility function `serializeContentWithBadges(editor)` that produces markdown with badge placeholders.
- Use this for the `worksheetContent` passed to the AI chat panel.

**3. Deserialize badges when applying AI edits (`WorksheetPage.tsx` → `handleApplyEdit`)**

When the AI returns content via `replace_worksheet_content`:
- Parse the markdown to HTML via `marked`
- Then scan for `[[CRM:...]]` patterns and replace them with the proper `<span data-crm-badge ...>` HTML before calling `editor.setContent(html)`

Alternatively (cleaner): build TipTap JSON directly by parsing markdown + re-inserting `crmBadge` nodes where placeholders appear.

**4. Update the system prompt (`supabase/functions/chat/index.ts`)**

Add instructions to the system prompt explaining the badge syntax:
- "The content may contain CRM entity references in the format `[[CRM:entityType:entityId:label]]`. These are linked records from Bullhorn. You MUST preserve them exactly as-is, including their format and data. Do not modify, reformat, or remove them unless explicitly asked."

**5. Add Turndown rule for CRM badges (`WorksheetEditor.tsx`)**

Add a custom Turndown rule that converts `<span data-crm-badge>` elements into the `[[CRM:...]]` syntax instead of stripping them to plain text. This way the existing `onContentChange` flow automatically produces badge-aware markdown.

### Files Modified
- `src/components/editor/WorksheetEditor.tsx` — add Turndown rule for badge nodes
- `src/pages/WorksheetPage.tsx` — update `handleApplyEdit` to parse badge placeholders back into HTML
- `supabase/functions/chat/index.ts` — update system prompt with badge preservation instructions

