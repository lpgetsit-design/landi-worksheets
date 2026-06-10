
## Goal

Move the Design feature out of the Worksheet product and into the AskLandi Chat product. Design becomes a tool the assistant invokes mid-conversation; the rendered HTML appears in a collapsible right-side panel. Chat sessions, drafts, and revisions are persisted in the database so users can revisit their work.

## Workflow

1. User chats in `/chat`. A session is created on first message and gets its own URL `/chat/:sessionId`.
2. When the assistant emits the `replace_design_html` tool, the right panel slides in showing the rendered HTML. Each tool call appends a **revision** to the current **active draft**.
3. The user can keep iterating ("make the header dark") — new revisions stack onto the same draft. A revision selector lets them flip between versions.
4. **Save draft** button freezes the current draft (kept in the side panel as a card) and resets the active draft slot. The assistant is told a fresh design canvas is open.
5. The side panel shows: the live active draft on top, plus a list of saved-draft cards below. Cards can be clicked to preview/open in a new tab. Chat stays visible at all times (panel overlays/pushes, never replaces chat).
6. Reloading `/chat/:sessionId` restores messages, saved drafts, and the active draft with its latest revision.

## Data model

New tables in `public`:

- `chat_sessions` — `id`, `user_id`, `title`, `created_at`, `updated_at`. RLS: owner only.
- `chat_messages` — `id`, `session_id`, `role` (`user`|`assistant`|`tool`), `content`, `mentions jsonb`, `tool_name`, `tool_args jsonb`, `created_at`. RLS via session ownership.
- `chat_designs` — `id`, `session_id`, `title`, `status` (`active`|`saved`), `created_at`, `updated_at`. One `active` row per session at a time.
- `chat_design_revisions` — `id`, `design_id`, `revision_index`, `html`, `prompt_message_id` (nullable FK to chat_messages), `created_at`.

All four tables: GRANTs to `authenticated` + `service_role`, RLS scoped to `auth.uid()` via session ownership, updated_at trigger.

A sidebar listing past chat sessions is out of scope for this round (sessions are reachable by URL); we can add it later.

## Backend

- New edge function `chat-design` (clone the relevant parts of `design-chat`): streams SSE, exposes the `replace_design_html` tool plus the existing Bullhorn/Tavily tools, but is session-aware. On each `replace_design_html`:
  - Server inserts a new `chat_design_revisions` row under the session's current active `chat_designs`, creating the active design row if none exists.
  - Emits an SSE `design_revision` event with `{ designId, revisionId, revisionIndex, html }` so the client can update the panel.
- Persists user + assistant messages to `chat_messages` (including a tool message row when a design is produced).
- New endpoint/function action (or REST via supabase client) for **Save draft**: flips active design to `status='saved'`. Next `replace_design_html` will lazily create a new active design.
- Keep existing `design-chat` and `general-chat` functions in place during transition; route `/chat` to the new `chat-design` function. Remove `general-chat` once the new flow is verified.

## Frontend

- `src/pages/ChatPage.tsx` becomes a thin router that ensures a session exists, then navigates to `/chat/:sessionId`.
- Add route `/chat/:sessionId` → `ChatSessionPage` that:
  - Loads session, messages, designs, revisions on mount; keyed by `sessionId`.
  - Renders a 2-column layout: chat (always visible, min width preserved) + collapsible right `DesignPanel` (hidden by default; auto-opens when first revision arrives; user can toggle).
  - Streams from `chat-design`; appends tokens, handles `design_revision` events to update active draft + revisions list.
- New components in `src/components/chat/`:
  - `DesignPanel.tsx` — header with title, revision pager (`< 2 / 3 >`), Save button, Open-in-new-tab, Download PDF; body renders `DesignPreview`.
  - `SavedDesignsList.tsx` — collapsible card list under the active draft.
- Reuse `DesignPreview` from `src/components/design/DesignPreview.tsx`.
- Keep `WorksheetMentionInput` for @worksheet context.

## Worksheet cleanup

- `WorksheetPage.tsx`: remove the Design toggle/button, design panel rendering, `designHtml`/`designActive` state, design-related dropdown actions, and the `data-tour="design-toggle"` hook.
- Worksheet creation flows: drop `design` from selectable `DocumentType` options.
- Migrate existing data: convert `worksheets.document_type = 'design'` rows so they no longer appear (one-off update sets `document_type = 'note'` with the design HTML kept in `meta.design_html` so nothing is destroyed). After migration, the worksheet list query filters out anything still flagged design.
- Remove `design-chat` invocation paths from worksheet UI (`AIChatPanel` design-mode branch). The function file stays until we're confident nothing else points to it, then is deleted in a follow-up.

## Out of scope

- Sidebar of past chat sessions / thread switcher UI (sessions reachable by URL only for now).
- Sharing/public links for chat designs.
- Editing a saved draft after Save (saved = frozen for this iteration).

## Technical notes

- Auth: `chat-design` validates the user JWT (verify in code, `verify_jwt = false` in config per project convention).
- SSE event names: `status`, `token`, `design_revision`, `done`, `error`.
- IDs: DB generates UUIDs; AI SDK message IDs are not stored in UUID columns.
- Migration order per new table: CREATE → GRANT → ENABLE RLS → POLICY (+ updated_at trigger).
