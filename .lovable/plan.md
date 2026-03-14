

## Plan: Fix CRM Badge Overflow in Table Cells

**Problem**: CRM badges (`inline-flex` spans) don't wrap or truncate inside table cells, causing them to overflow into adjacent cells.

**Solution**: Add CSS rules to constrain badges within table cells and update the badge component to handle overflow gracefully.

### Changes

1. **`src/index.css`** — Add overflow handling for table cells and badges inside them:
   - `overflow: hidden` on `td`/`th` (already partially there)
   - Badge spans inside table cells: `max-width: 100%`, `overflow: hidden`, `text-overflow: ellipsis`, `flex-wrap: wrap` or truncation

2. **`src/components/editor/CrmBadgeView.tsx`** — Add `max-w-full overflow-hidden text-ellipsis` and `whitespace-nowrap` (or `flex-wrap`) classes to the badge wrapper span so it truncates gracefully when space is limited.

### Specific CSS additions (`src/index.css`):
```css
.ProseMirror table td,
.ProseMirror table th {
  overflow: hidden;
  word-break: break-word;
}

.ProseMirror table .node-crmBadge,
.ProseMirror table span[data-crm-badge] {
  max-width: 100%;
  overflow: hidden;
}
```

### Badge view update (`CrmBadgeView.tsx`):
- Add `max-w-full overflow-hidden` to the outer badge span
- Add `truncate` to the label/name span so long names get ellipsized
- Keep the ID and type short spans as-is

