

## Plan: Add Bullhorn FastFind Tool to AI Chat (Server-Side)

### Goal
Give the AI a `lookup_bullhorn_entity` tool that runs server-side in the chat edge function. The AI will automatically call it when it encounters Bullhorn entity IDs in text (or when the user mentions entities), look them up, and embed proper `[[CRM:...]]` badges in the output.

### Changes

**1. `supabase/functions/bullhorn-proxy/index.ts`** — Accept `entity_lookup` action

Add support for `action: "entity_lookup"` alongside the existing `"fastfind"`. Same underlying `fastFind` call, but returns simplified results (entityType, id, label) for the AI to consume.

**2. `supabase/functions/chat/index.ts`** — Major updates

- **Add `lookup_bullhorn_entity` tool definition** with a `query` parameter (string — name, ID, or partial match).
- **Implement server-side agentic loop**: When the AI returns a `lookup_bullhorn_entity` tool call, the chat function:
  1. Calls `bullhorn-proxy` internally via `fetch(SUPABASE_URL + "/functions/v1/bullhorn-proxy", { body: { action: "entity_lookup", query } })`
  2. Formats results as a tool response message
  3. Sends updated messages back to the AI for another round
  4. Repeats until the AI produces a final response (with only client-side tools or plain text)
- Only client-side tool calls (`replace_worksheet_content`, `update_worksheet_title`, `update_document_type`) are returned to the frontend.
- **Update system prompt** to instruct the AI:
  - "When you see a Bullhorn entity ID (numeric) in text, or when a user mentions a person/company/job by name, use `lookup_bullhorn_entity` to resolve it."
  - "After lookup, always embed the entity as `[[CRM:entityType:entityId:label]]` in your content output."
  - "Proactively scan worksheet content for bare numeric IDs that could be Bullhorn references and resolve them."

**3. `src/components/chat/AIChatPanel.tsx`** — Minor update

Add `lookup_bullhorn_entity: "Looked up CRM entity"` to the `toolLabels` map. No other client changes needed since this tool executes entirely server-side.

### Architecture

```text
User prompt → Chat Edge Function
  ↓
  AI model (with lookup_bullhorn_entity tool)
  ↓ (AI calls tool)
  Chat function → bullhorn-proxy (entity_lookup)
  ↓ (results back to AI)
  AI model (generates content with [[CRM:...]] badges)
  ↓ (returns client-side tools only)
  Frontend (executes replace_worksheet_content, etc.)
```

### Files Modified
- `supabase/functions/bullhorn-proxy/index.ts` — add `entity_lookup` action
- `supabase/functions/chat/index.ts` — add tool, server-side loop, updated prompt
- `src/components/chat/AIChatPanel.tsx` — add tool label

