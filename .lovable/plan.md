## Goal

The AI panel inside a worksheet should be the **exact same AskLandi** that lives at `/chat`: same session history sidebar, same chat_sessions/chat_messages/chat_designs data model, same design panel with WYSIWYG editor, undo/redo, share, etc. The only differences when launched from a worksheet:

1. The current worksheet is auto-attached to every turn as a sticky @mention (chip visible, removable).
2. AskLandi still has the worksheet-specific tools: `apply_edit`, `update_title`, `update_document_type`.
3. Sessions started inside a worksheet are scoped to that worksheet — they show up in the worksheet panel's history sidebar but are hidden from the global `/chat` sidebar.

## What changes

### 1. Extract the chat shell into a reusable component
Refactor `src/pages/ChatPage.tsx`:
- Move `ChatSessionView` and the surrounding session bootstrap into a new `src/components/chat/AskLandiChat.tsx` that accepts props:
  - `scope: "global" | { worksheetId: string; worksheetTitle: string; worksheetType: DocumentType; getWorksheetContent: () => string }`
  - `sessionId | null` plus `onSessionChange(id)` so the parent owns the URL/state.
  - Optional editor write-back callbacks: `onApplyEdit`, `onUpdateTitle`, `onUpdateDocumentType` (only wired when `scope` is a worksheet).
- `ChatPage` becomes a thin wrapper that handles `/chat/:sessionId` routing and renders `<AskLandiChat scope="global" sessionId={...} />`.

### 2. Session scoping (no schema migration needed)
Add an optional `worksheet_id` column to `chat_sessions` so we can filter:
- Worksheet panel lists & creates sessions where `worksheet_id = <current>`.
- `/chat` sidebar lists sessions where `worksheet_id IS NULL`.
- Existing sessions remain global (NULL), so nothing breaks.

A small migration adds the nullable column + index. RLS already restricts to owner; no policy change needed.

### 3. Sticky worksheet mention
In `AskLandiChat`, when `scope` is a worksheet:
- Seed the mention pool with `{ worksheetId, title, documentType }` on every send.
- Render a non-removable (or removable, with a "re-attach" affordance) chip above the input showing the current worksheet so the user sees it's in context.
- Reuses the existing `referencedWorksheets` payload that `design-chat` already fetches and grounds on — no edge-function change required for context.

### 4. Editor write-back tools
The `design-chat` edge function already accepts `tool_calls`. Today only the standalone chat handles `replace_design_html` / `update_worksheet_title` client-side. Add a worksheet-scope branch in `AskLandiChat` that, when `scope` is a worksheet, also handles:
- `apply_edit(markdown)` → calls `onApplyEdit`
- `update_title(title)` → calls `onUpdateTitle`
- `update_document_type(type)` → calls `onUpdateDocumentType`

Expose these tool definitions to the model only when `worksheet_id` is present (pass a `worksheetScope` flag to `design-chat` and conditionally include those tool schemas in the system/tool list).

### 5. WorksheetPage integration
Replace the current `AIChatPanel` usage in `src/pages/WorksheetPage.tsx`:
- Render `<AskLandiChat>` inside the right-side `ResizablePanel` (and mobile Sheet) with `scope` set to the worksheet, plus the editor callbacks.
- Local state owns `activeSessionId` (no URL change for worksheets — we don't want to leave the worksheet URL). Sessions are picked from the in-panel history sidebar.
- The existing `selectedText` / `autoMessage` flow (selection toolbar → "ask AI about this") is preserved: when set, prefill the composer with the selection and instruction.

### 6. Cleanup
- `AIChatPanel.tsx`, `CrmChatContent.tsx` become unused once the worksheet panel switches over. Delete after verifying nothing else imports them.
- `SessionHistorySidebar` accepts a `worksheetId?: string` filter prop so the same component serves both scopes.

## Files touched

- **New**: `src/components/chat/AskLandiChat.tsx` (the extracted shell)
- **Edited**: `src/pages/ChatPage.tsx` (thin wrapper)
- **Edited**: `src/pages/WorksheetPage.tsx` (use `AskLandiChat` instead of `AIChatPanel`)
- **Edited**: `src/components/chat/SessionHistorySidebar.tsx` (worksheetId filter)
- **Edited**: `supabase/functions/design-chat/index.ts` (conditionally expose worksheet-write tools when `worksheetScope` is sent)
- **Migration**: add `chat_sessions.worksheet_id uuid null` + index
- **Deleted** (after smoke test): `src/components/chat/AIChatPanel.tsx`, `src/components/chat/CrmChatContent.tsx`

## Out of scope

- No changes to design editor, undo/redo, or revisions.
- No changes to library/share flows.
- Worksheet selection toolbar UX stays as-is.

## Verification

- Open a worksheet → AskLandi panel shows empty session list scoped to that worksheet; create one; the worksheet appears as a sticky chip; send a message; design appears in the panel.
- Reload worksheet → session list restored; click a past session → restores messages + active design.
- Open `/chat` → only global (non-worksheet) sessions appear.
- Ask AskLandi to "rename this worksheet to X" → title updates via `update_title` tool.
- Select text in editor → "Ask AI" → composer prefilled in the panel.
