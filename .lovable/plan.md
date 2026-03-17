

## Plan: Bigger Summary Popup & Responsive Badges

### Changes

**1. Summary Popover (`src/pages/WorksheetPage.tsx`, line 78)**
- Change `w-80 max-h-60` to `w-96 max-h-80` — wider (384px vs 320px) and taller to fit badges properly

**2. Summary HTML badges (same file, line 42 regex replacement)**
- Add `max-w-full overflow-hidden` and change the label `<span>` to use `truncate` so badges don't overflow the popover

**3. CRM Badge in editor (`CrmBadgeView.tsx`, line 80)**
- Already has `max-w-full overflow-hidden` — no change needed

**4. CRM Badge in chat (`CrmBadgeInline.tsx`, line 19)**
- Add `max-w-full overflow-hidden` to the outer span so it respects parent width

**5. Link Badge (`LinkBadgeInline.tsx`, line 58-60)**
- Add `max-w-full overflow-hidden` to the outer `<a>` tag
- Change `max-w-[200px]` on the title span to `min-w-0 truncate` (no fixed max) so it adapts to parent width

**6. Worksheet Badge in editor (`WorksheetBadgeView.tsx`, line 28)**
- Add `max-w-full overflow-hidden` to the outer span

**7. CrmBadgeNode renderHTML (`CrmBadgeNode.ts`, line 65)**
- Add `max-w-full overflow-hidden` to the class string for server-rendered HTML badges

**8. WorksheetBadgeNode renderHTML (`WorksheetBadgeNode.ts`, line 41)**
- Add `max-w-full overflow-hidden` to the class string

All badges will use the pattern: outer `inline-flex max-w-full overflow-hidden`, label span uses `truncate min-w-0`, fixed elements use `shrink-0`.

