

## Plan: Make All Pages Responsive

### Current Issues
1. **Dashboard** (`max-w-2xl px-4`) — works reasonably but filter bar could overflow on small screens
2. **WorksheetPage** — AI chat panel is fixed `w-[350px]` side panel, won't work on mobile; editor has fixed `max-w-[800px] px-6`
3. **AIChatPanel** — fixed `w-[350px]`, no mobile treatment; should be full-screen overlay on mobile
4. **AuthPage** / **PendingApprovalPage** — already centered with `max-w-sm`/`max-w-md`, mostly fine
5. **AppHeader** — already responsive

### Changes

| File | Change |
|------|--------|
| `src/pages/Dashboard.tsx` | Reduce padding on mobile (`px-3 sm:px-4`), make filter bar stack/scroll on small screens, shrink button text on mobile |
| `src/pages/WorksheetPage.tsx` | On mobile, hide side-by-side layout; AI panel becomes a full-screen overlay (Sheet). Reduce editor padding (`px-3 sm:px-6`). Toolbar buttons stack better. |
| `src/components/chat/AIChatPanel.tsx` | On mobile: render as a `Sheet` (full-width overlay) instead of fixed-width side panel. On desktop: keep current `w-[350px]` side panel. Accept `isMobile` or use the `useIsMobile` hook internally. |
| `src/components/editor/WorksheetEditor.tsx` | Reduce horizontal padding on mobile; ensure toolbar wraps properly |
| `src/components/editor/EditorToolbar.tsx` | Make toolbar buttons wrap on small screens with `flex-wrap` |
| `src/pages/PendingApprovalPage.tsx` | Minor: add `px-4` padding (already has it, verify) |

### Key Responsive Patterns
- Use `useIsMobile()` hook (already exists) to toggle chat panel rendering
- On mobile, AIChatPanel renders inside a `Sheet` (bottom or side) instead of inline
- Filter bar uses `flex-wrap` and `overflow-x-auto` for small screens
- Editor max-width stays fluid, padding reduces on mobile
- Worksheet page toolbar buttons: hide text labels on mobile, show icons only

