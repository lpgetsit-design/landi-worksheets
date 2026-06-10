## Goal
Add a second product alongside Worksheets: a standalone **Chat** page for general Q&A that can pull in worksheets as context via `@<worksheet-name>` mentions (live search popup). Add a nav bar in the header to switch between the two.

## 1. Top Nav

Update `src/components/AppHeader.tsx`:
- Replace the "Worksheets" title button with two nav links: **Worksheets** (`/`) and **Chat** (`/chat`).
- Active route gets `text-foreground` + underline; inactive `text-muted-foreground`.
- Keep theme toggle + sign-out on the right.

## 2. Routing

`src/App.tsx`: add a protected route `/chat` → `ChatPage`.

(Single conversation, no persistence for v1 — matches existing worksheet chat behavior. We can add thread history later if desired.)

## 3. New Chat Page

New file `src/pages/ChatPage.tsx`:
- Full-height layout below header.
- Centered max-w-3xl column with:
  - Message transcript (markdown via `marked`, same styling as `AIChatPanel`).
  - Composer at bottom using a new `GeneralChatInput` (see §4).
  - Reset button in a slim header row.
- Streaming SSE consumption reusing the same parser pattern as `AIChatPanel.streamChat` (status / token / tool_calls / tool_result / done / error events).
- Posts to a new edge function `general-chat` (see §5).
- Builds a `referencedWorksheets` array from mentions and sends it in the request body so the server can inject worksheet content as context.

## 4. Composer with Worksheet @Mentions

New file `src/components/chat/GeneralChatInput.tsx`:
- Based on existing `src/components/chat/ChatInput.tsx`, but stripped down (no design-mode toggle, no CRM mentions — worksheet-only).
- Reuses `WorksheetLinkMenu`-style live search via the existing `useWorksheetSearch` hook to populate a popup when the user types `@`.
- Tracks selected mentions as chips above the textarea; submit sends `{ text, mentions: [{ worksheetId, title, documentType }] }`.
- Enter to send, Shift+Enter newline, auto-resize.

(We keep this separate from the Tiptap-based `WorksheetLinkExtension` because the chat composer is a plain textarea, not Tiptap.)

## 5. Edge Function: `general-chat`

New file `supabase/functions/general-chat/index.ts`:
- CORS + streaming SSE response, same shape the client already parses.
- Uses Lovable AI Gateway (`LOVABLE_API_KEY`) with `google/gemini-2.5-flash` (same model family used elsewhere in this project).
- Request body: `{ messages, referencedWorksheets: [{ id, title, documentType }] }`.
- On entry: for each referenced worksheet, fetch `title`, `document_type`, `content_md` from `worksheets` using the service-role client, and prepend a system message:
  ```
  The user has attached the following worksheets as context:
  --- Worksheet: "<title>" (<type>) ---
  <content_md>
  ```
- System prompt: general helpful assistant; if worksheets are attached, ground answers in them and cite by title.
- No client tools, no worksheet-editing tools. Optionally include the Tavily web-search tools so it can answer general questions that need fresh info (reuse the helpers from `chat/index.ts` — copy minimally rather than refactor to keep scope tight).

## 6. Minor

- Add a `data-tour` hook later if we want to extend the onboarding tour to the chat product (out of scope for this change).
- No DB schema changes.

## Technical notes
- Files created: `src/pages/ChatPage.tsx`, `src/components/chat/GeneralChatInput.tsx`, `supabase/functions/general-chat/index.ts`.
- Files edited: `src/App.tsx`, `src/components/AppHeader.tsx`.
- No migrations. No new secrets (`LOVABLE_API_KEY`, `TAVILY_API_KEY` already present).
