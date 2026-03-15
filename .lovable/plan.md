

## Improve Table Editing UX

### Problem
Tables in the editor currently lack intuitive controls for adding rows/columns and resizing. Users must rely on knowing TipTap commands or the slash menu.

### Approach
1. **Floating table toolbar** — When the cursor is inside a table, show a contextual toolbar with add/delete row/column buttons
2. **Column resize handles** — Already enabled (`resizable: true`), but needs CSS for the resize handle grip
3. **Keyboard shortcuts** — Tab to move between cells (already built into TipTap table), plus shortcuts for adding rows
4. **Add row/column buttons on edges** — Small `+` buttons at the bottom and right edge of the table

### Changes

#### 1. New component: `src/components/editor/TableControls.tsx`
A floating toolbar that appears when the cursor is inside a table. Uses `editor.isActive('table')` to show/hide. Contains buttons for:
- Add row above / below
- Add column left / right  
- Delete row / column
- Delete table
- Merge/split cells (if selected)

Positioned above the table using `BubbleMenu` from TipTap or a manually positioned absolute div that tracks the table element.

#### 2. Update `src/components/editor/WorksheetEditor.tsx`
- Import and render `TableControls` alongside the editor
- Pass the editor instance to `TableControls`

#### 3. Update `src/index.css` — Table resize handle styles
Add CSS for the TipTap column resize handle (the `resizable: true` config generates `.column-resize-handle` elements that need styling):

```css
.ProseMirror .column-resize-handle {
  position: absolute;
  right: -2px;
  top: 0;
  bottom: 0;
  width: 4px;
  background-color: hsl(var(--primary));
  cursor: col-resize;
  z-index: 20;
}

.ProseMirror.resize-cursor {
  cursor: col-resize;
}
```

Also add hover row highlight and a `+` button pattern using `::after` pseudo-elements on table rows/cells for add-row/add-column affordances.

#### 4. Update `src/components/editor/EditorToolbar.tsx`
Add a table dropdown menu (instead of a single insert button) with options: Insert Table, and when inside a table — Add Row, Add Column, Delete Row, Delete Column, Delete Table.

### Keyboard Shortcuts
- `Tab` / `Shift+Tab` — move between cells (built-in)
- `Ctrl+Enter` (inside table) — add row below (custom keybinding via TipTap extension or `addKeyboardShortcuts`)

### Implementation Notes
- TipTap's table extension with `resizable: true` already creates column resize handles — we just need to style them
- The floating table controls will use the editor's `isActive('table')` state
- All table commands (`addRowAfter`, `addColumnAfter`, `deleteRow`, `deleteColumn`, `deleteTable`, `mergeCells`, `splitCell`) are available on the editor chain from `@tiptap/extension-table`

