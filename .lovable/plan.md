## Goal

Worksheets become a second artifact type inside an AskLandi chat session, with the same lifecycle as designs: AI iterates by appending revisions, the user manually edits inside an embedded TipTap editor, saves to Space (folder picker), and shares via the existing public share infrastructure. The standalone `/worksheet/:id` route, the global `Documents` tab, and the worksheet-scope variant of AskLandi all go away.

## Lifecycle parity with designs

For every worksheet (analogous to every design):
- One `chat_sessions` row hosts the conversation.
- One worksheet artifact per session at a time can be `status='active'`; the rest are `saved`.
- Each AI edit appends an immutable revision (no destructive overwrite).
- Manual edits in the embedded TipTap editor also append a revision (matches design "Save edits").
- "Save to Space" prompts the existing `FolderPickerDialog`, sets `status='saved'` + `folder_id`, locks further AI edits from extending it, and starts the next worksheet fresh in the same session.
- "Share" opens the same `ShareDialog` already wired for `public_share_links.worksheet_id` and renders externally at `/s/:token` via the existing `public-share` Edge Function.

## Data model

Schema migration (one migration call, with GRANTs + RLS):
- `worksheets`: add `session_id uuid NULL REFERENCES chat_sessions(id) ON DELETE SET NULL` and `status text NOT NULL DEFAULT 'saved'` constrained to `('active','saved')`.
- New `worksheet_revisions(id, worksheet_id, revision_index, content_json jsonb, content_md text, content_html text, prompt_message_id uuid NULL, created_at)`; uniqueness on `(worksheet_id, revision_index)`; RLS scoped via the existing `is_worksheet_owner` (and the existing `has_worksheet_access` helper for read by grantees).
- Backfill: for every existing `worksheets` row create a `chat_sessions` row (title = worksheet title, `worksheet_id` left NULL — this column was the "this session is locked to one worksheet page" flag and is no longer used), set `worksheets.session_id` to it, status `saved`, and insert one `worksheet_revisions` row (`revision_index=0`) carrying the current `content_json/md/html`.
- Drop unused columns / leave for now: keep `worksheet_entities` (CRM badges) and `worksheet_access_grants` (internal sharing) intact. Stop using `worksheet_embeddings`, `worksheet_versions`, and the summary/keyword pipelines from the UI (tables remain so existing rows do not disappear; can be cleaned up later).

## Routing changes

- Remove `/worksheets` (the old Dashboard) and the `Documents` nav link in `AppHeader`.
- `/worksheet/:id`: kept only as a redirect resolver. If current user owns the worksheet, navigate to `/chat/<session_id>?worksheet=<id>`. If the user is a grantee (via `worksheet_access_grants`), render a new read-only viewer (`WorksheetReadOnlyPage`) that shows the latest revision with the existing TipTap renderer plus a download/share-back affordance.
- `/library` renamed to `/artifacts` (keep `/library` as an alias redirect). Nav label becomes `Artifacts`.
- My Space tree, breadcrumbs and item lists already query both tables; only labels need to change ("Documents" -> "Worksheets").

## Chat right-side panels

The chat right pane today is always `DesignPanel`. It becomes a panel host that can render either:
- `DesignPanel` (unchanged)
- `WorksheetPanel` (new) – embeds the existing `WorksheetEditor` (TipTap) in read-only mode by default with an Edit toggle. Header: title (rename), revision arrows (prev/next), Undo/Redo (TipTap built-in history), Save edits (appends a revision), Save to Space (`FolderPickerDialog`), Share (`ShareDialog`), Open in PDF.

If a session has both a design and a worksheet, the panel header shows tabs `Design • Worksheet` to switch. Saved artifacts of both kinds appear in the bottom "Saved" strip (already present for designs).

## AI tools and Edge Function

`design-chat` Edge Function gains worksheet tools while keeping the design ones:
- `replace_worksheet_content(content_md, content_html, content_json?)` – analog of `replace_design_html`. On the client this calls the new `appendWorksheetRevision` (mirror of `appendRevision`).
- `update_worksheet_title(title)` already exists; repoint to the active worksheet.
- Retire the page-scoped `apply_worksheet_edit`, `rename_current_worksheet`, `set_worksheet_document_type` tools and the `worksheetScope` request shape. The Edge Function reads the active worksheet for the session directly to seed `currentWorksheetMarkdown` analogous to `currentHtml`.
- System prompt: when an active worksheet exists, allow the model to choose between a normal chat reply, design tools, and worksheet tools; describe the difference (HTML page vs. structured document).

@worksheet mentions in the composer are removed (per the worksheet-only features choice). `WorksheetMentionInput` becomes a plain composer; remove `referencedWorksheets` plumbing.

## Components touched / added / removed

Added
- `src/components/chat/WorksheetPanel.tsx` – right-pane TipTap host with revision navigation, edit/save/share/PDF actions.
- `src/pages/ArtifactsPage.tsx` – new combined list (rename of `LibraryPage`) with a `Type` badge (Design / Worksheet), unified search and sort, share-stats per artifact, Resume / New chat with this artifact / Share / Open. Resume for a worksheet goes to `/chat/<session>?worksheet=<id>`.
- `src/pages/WorksheetReadOnlyPage.tsx` – grantee viewer for `/worksheet/:id` when the current user is not the owner.
- `src/lib/worksheets.ts` helpers: `ensureActiveWorksheet(sessionId, titleHint)`, `appendWorksheetRevision(worksheetId, content)`, `saveWorksheetToSpace(worksheetId, folderId, title)`, `reopenSavedWorksheet`.

Repurposed
- `src/pages/WorksheetPage.tsx` – becomes a thin redirect/grantee guard (owner → chat; grantee → `WorksheetReadOnlyPage`). All header/editor/attachments/summary chrome removed.
- `src/components/chat/AskLandiChat.tsx` – manage worksheets array alongside designs; drop `worksheetScope` prop and its sticky-mention/tool behavior; add panel-tab switching when both artifact types exist.
- `src/pages/SpacePage.tsx` – relabel "Documents" → "Worksheets"; cards link into the session (`/chat/<session>?worksheet=<id>`).
- `src/components/AppHeader.tsx` – nav becomes `My Space`, `Chat`, `Artifacts`.
- `src/App.tsx` – route table updates per Routing section above.

Removed
- `src/pages/Dashboard.tsx` and its `/worksheets` route entry.
- `src/components/chat/WorksheetMentionInput.tsx` `@`-search popover and `useWorksheetSearch` hook usage in chat (replaced with a plain textarea composer).
- Worksheet-page-only chrome from the old `WorksheetPage`: `SummaryButton`, `AttachmentPanel`, PDF / share top-bar wiring (PDF + share move into `WorksheetPanel`; attachments/summary removed per the chosen feature scope).

## Migration ordering (single deployable change)

1. SQL migration (schema add + revisions table + backfill, all in one transaction).
2. Edge Function update (`design-chat` learns the new worksheet tools; existing design behavior unchanged).
3. Frontend changes shipped together so the legacy Dashboard never loads against the new schema.

## Out of scope for this change

Hybrid search / embeddings / @worksheet mentions / file attachments / AI summaries / keyword extraction (per user's feature-scope choice). Their tables remain so nothing is destroyed; the UI surfaces are simply removed.
