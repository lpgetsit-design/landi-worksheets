

## Interactive Data Table for Worksheet Editor

### Problem
Tables in the TipTap editor are static HTML structures with no sorting, filtering, or data analysis capabilities.

### Approach
Create a custom TipTap NodeView that wraps tables with an interactive React overlay providing per-column sort, filter, and intelligent type detection. The table data remains editable in TipTap but gains a "data mode" toggle that activates the interactive features.

### Architecture

```text
TipTap Table Node
  └── Custom NodeView (React)
       ├── Header row with sort indicators + filter dropdowns
       ├── Column type auto-detection (number, text, badge, date)
       ├── Filter UI per column (type-aware)
       └── Sorted/filtered row rendering
```

### Changes

#### 1. New: `src/components/editor/DataTableView.tsx`
React NodeView component that replaces the default TipTap table rendering. Features:
- **Type detection engine**: Scans column cells to classify as `number`, `text`, `date`, or `badge` (detects `[data-crm-badge]` spans)
- **Sort controls**: Click header to cycle ascending/descending/none per column
- **Filter UI**: Per-column dropdown in header — text columns get search input, number columns get min/max range, badge columns get multi-select of entity types/labels
- **Toggle**: Small icon button on table hover to switch between edit mode (normal TipTap editing) and data mode (sort/filter active, cells read-only)
- Renders the underlying TipTap table content, applying sort/filter transformations on the displayed rows

#### 2. New: `src/components/editor/DataTableExtension.ts`
Custom TipTap extension that extends the built-in `Table` extension with `addNodeView()` pointing to the `DataTableView` React component. Adds a `dataMode` attribute to the table node to persist whether data mode is active.

#### 3. Modify: `src/components/editor/WorksheetEditor.tsx`
- Replace `Table` import with `DataTableExtension` (which extends Table internally)
- Remove the standalone `Table`, `TableRow`, `TableCell`, `TableHeader` imports (bundled in the extension)

#### 4. New: `src/components/editor/TableFilterPopover.tsx`
Reusable popover component for column filters:
- **Text**: Search input with contains/starts-with matching
- **Number**: Min/max range inputs
- **Badge**: Checkbox list of unique entity types found in column
- **Date**: Date range picker (if dates detected)
- Clear filter button per column

#### 5. Modify: `src/index.css`
Add styles for data table overlay: sort indicator arrows, filter icons on headers, active filter highlighting, data-mode visual distinction (subtle background change on the table).

### Type Detection Logic
```text
For each column, scan all body cells:
1. If cell contains [data-crm-badge] → "badge"
2. If all non-empty values parse as numbers → "number"  
3. If all non-empty values parse as dates → "date"
4. Otherwise → "text"
```

### UX Details
- In **edit mode**: table works exactly as before (full TipTap editing)
- In **data mode**: sort/filter controls appear, cells become read-only, rows can be reordered visually without changing the underlying document (sort is display-only)
- A small toggle icon (filter/grid icon) appears on hover over the table to switch modes
- Active filters show a visual indicator (dot/highlight) on the column header
- Sort shows up/down arrow on the sorted column header

