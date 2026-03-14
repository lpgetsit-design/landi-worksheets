

## Plan: Add "Enhance" Button for Worksheet Body

### What
Add an "Enhance" button (with Sparkles icon) next to the document type selector. When clicked, it sends the worksheet content to the AI chat edge function with a specialized prompt that reformats/paraphrases the content based on the document type — without adding new information.

### Changes

**1. `src/components/editor/WorksheetEditor.tsx`** — Add `EnhanceContentButton` component

- Similar pattern to `GenerateTitleButton`: a button with loading state that calls the chat edge function
- Sends a prompt like: *"You are enhancing a [document_type] worksheet. Rewrite the following content in a more formal, well-structured format appropriate for a [document_type]. Do NOT add any new information. Keep all content exactly the same but improve paraphrasing, formatting, and structure. Preserve all [[CRM:...]] badges exactly as-is."*
- On success, extracts the `replace_worksheet_content` tool call result and sets the editor content
- Place the button in the header row, next to the document type selector
- Always visible (not conditional like the title button)

**2. `supabase/functions/chat/index.ts`** — No changes needed

The existing chat function already supports `replace_worksheet_content` tool calls and the system prompt handles content replacement. The enhance button just sends a specific user message.

### Button Behavior
- Shows `Sparkles` icon with "Enhance" label
- Shows `Loader2` spinner while processing
- Calls the same `/functions/v1/chat` endpoint with a tailored prompt
- Parses the response for `replace_worksheet_content` tool call → updates editor content
- Falls back to raw content response if no tool call
- Saves the updated content to the database
- Shows toast on error

### Files Modified
- `src/components/editor/WorksheetEditor.tsx` — add `EnhanceContentButton` component and render it in the header

