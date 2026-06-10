## Library page for AskLandi artifacts

A new top-level "Library" destination that aggregates every saved design produced inside any chat session, with search, sorting, and two ways to keep working on a design.

### Scope

- Shows only designs with `status = 'saved'` (Save button output).
- Each row uses the **latest revision** as the preview/snippet source.
- Designs without any revisions are skipped.

### Navigation

- New top-level link `Library` in `AppHeader`, next to `Worksheets` and `Chat`.
- Route: `/library` → `LibraryPage`, wrapped in `ProtectedRoute`.

### Library page UI

Layout:

```text
Library
[ search visible text…        ]   [ Sort: Newest ▾ ]
─────────────────────────────────────────────────
[ thumbnail/preview ]  Title
                       updated · session "Chat title"
                       short text excerpt…
                       [ Resume chat ]  [ New chat with this design ]
```

- Search box: filters by visible text of the latest revision (HTML tags stripped client-side) and title; case-insensitive substring match.
- Sort dropdown: `Newest first` (default), `Oldest first`, `Recently updated`.
- Empty state when no saved designs exist; "no matches" state when search returns nothing.
- Card click (outside the action buttons) opens a preview dialog with the rendered HTML (reuses `DesignPreview`).

### Per-item actions

1. **Resume chat** → navigates to `/chat/<original_session_id>?design=<design_id>`. ChatPage reads the `design` query param after initial load and calls the existing `reopenSavedDraft(designId)` so the design opens in the right panel ready for further iteration.
2. **New chat with this design** → server actions, then navigate:
   - Insert a new `chat_sessions` row (title `"Continued from <design title>"`).
   - Insert a new `chat_designs` row (`status = 'active'`, same `title`) into that session.
   - Insert a `chat_design_revisions` row with `revision_index = 0` and the latest HTML from the source design copied verbatim.
   - Navigate to `/chat/<newSessionId>`. The existing load logic will show the active design in the panel.
   - Fully independent copy — edits do not affect the original design.

### Data fetching

- Single query: `chat_designs` joined with `chat_design_revisions` and `chat_sessions(title)`, filtered to `status = 'saved'`, ordered by `updated_at desc`. Existing RLS already scopes by session ownership.
- Client picks the latest revision per design (max `revision_index`).
- Visible-text search is computed client-side by stripping tags (`html.replace(/<[^>]+>/g, " ")`) and lower-casing. Adequate for a per-user list; no schema or function changes needed.

### Files

- New `src/pages/LibraryPage.tsx` — page component (list, search, sort, actions, preview dialog).
- New `src/components/library/LibraryDesignCard.tsx` — single row/card (kept separate to keep the page small).
- Edit `src/components/AppHeader.tsx` — add `Library` `NavLink`.
- Edit `src/App.tsx` — register `/library` route under `AuthenticatedLayout` / `ProtectedRoute`.
- Edit `src/pages/ChatPage.tsx` — read `?design=` query param after `loaded` flips true; if it matches a saved design in this session, call `reopenSavedDraft(id)` once and clear the param.

### Out of scope

- No new database migration; reuses existing tables and RLS.
- Worksheet artifacts are not added to the Library yet (designs only, per the request).
- No bulk delete/share from Library in this pass.
