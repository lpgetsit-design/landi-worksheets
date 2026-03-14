

## Problems Identified

1. **Worksheet content not sent to AI**: `worksheetContent` state starts as `""` and only updates via `onContentChange` when the user *edits* the document. If the user opens an existing worksheet and immediately chats, the AI sees an empty worksheet. The network logs confirm: `"worksheetContent":""` despite the worksheet having content.

2. **No "Apply Edit" flow**: In Edit mode, the AI returns suggested text in the chat bubble, but there is no mechanism for the user to review and apply those changes back into the TipTap editor.

## Plan

### 1. Fix worksheet content initialization

**WorksheetPage.tsx**: Initialize `worksheetContent` from the loaded worksheet's `content_md` field once the query resolves, so the AI always has the current text even before the user types anything.

- Add a `useEffect` that sets `worksheetContent` from `worksheet.content_md` when the worksheet data loads.

### 2. Add "Apply to Worksheet" button for Edit mode responses

**AIChatPanel.tsx**:
- Add a new prop `onApplyEdit: (content: string) => void` callback.
- For assistant messages when `mode === "edit"`, render an "Apply" button below the message bubble.
- When clicked, call `onApplyEdit(msg.content)` which passes the AI's suggested text up to the parent.
- After applying, show a "Revert" button that restores the previous content.
- Store `pendingEdit` state: `{ messageId, previousContent }` to track what can be reverted.

**WorksheetPage.tsx**:
- Pass an `onApplyEdit` callback to `AIChatPanel`.
- This callback calls a new method on the editor to replace its content.

**WorksheetEditor.tsx**:
- Expose the TipTap `editor` instance to the parent via a ref (`useImperativeHandle`) or a callback prop so the parent can call `editor.commands.setContent(...)`.
- Add a `setContent` method or accept an `externalContent` prop that, when changed, replaces the editor content.

### 3. Edge function system prompt update

**supabase/functions/chat/index.ts**: Update the edit-mode system prompt to instruct the AI to return the full revised text in a clear format (e.g., inside a markdown code block) so it can be cleanly extracted and applied. Also instruct it to briefly explain what changed before showing the revised content.

### Technical flow

```text
User types edit request
        │
        ▼
  AI returns suggested content
        │
        ▼
  [Apply] button shown on message
        │
        ▼
  User clicks Apply
        │
        ▼
  Previous content saved for revert
  Editor content replaced via editor.commands.setContent()
        │
        ▼
  [Revert] button appears
```

### Files to modify
- `src/pages/WorksheetPage.tsx` — init content from DB, wire `onApplyEdit`
- `src/components/chat/AIChatPanel.tsx` — add Apply/Revert buttons, new prop
- `src/components/editor/WorksheetEditor.tsx` — expose editor ref for content replacement
- `supabase/functions/chat/index.ts` — refine edit-mode prompt

