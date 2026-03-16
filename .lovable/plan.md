

# Kanban Board Container — Implementation Plan

## Problem
Currently, `workflowLane` nodes are inserted as independent block-level nodes that stack vertically. There's no grouping container, so lanes can't sit side-by-side like a kanban board.

## Solution
Introduce a new `workflowBoard` parent node that wraps multiple lanes in a horizontal row, similar to how a `table` wraps `tableRow` nodes.

## Architecture

```text
Document
  ├─ paragraph ...
  ├─ workflowBoard { id, title }          ← NEW container
  │    ├─ workflowLane { stageKey: "backlog" }
  │    │    └─ workflowCard ...
  │    ├─ workflowLane { stageKey: "in_progress" }
  │    │    └─ workflowCard ...
  │    └─ workflowLane { stageKey: "done" }
  │         └─ workflowCard ...
  ├─ paragraph ...
  └─ workflowBoard { ... }               ← another board = another row
```

## New Files

### `src/components/editor/WorkflowBoardNode.ts`
- Tiptap `Node.create()` with `name: "workflowBoard"`, `group: "block"`, `content: "workflowLane+"`
- Attributes: `id`, `title`
- Uses `ReactNodeViewRenderer` for the view

### `src/components/editor/WorkflowBoardView.tsx`
- React node view wrapping lanes in a horizontal flex container
- Desktop: `flex-row` with equal-width lanes, horizontal scroll if needed
- Mobile: `flex-col` stacked vertically
- Non-editable header with board title (editable input) and "+ Add Lane" button
- `NodeViewContent` renders child lanes inside the flex container
- Each lane gets `min-w-[250px] flex-1` styling

## Modified Files

### `src/components/editor/WorkflowLaneNode.ts`
- Change `group` from `"block"` to remove it from top-level group (lanes should only exist inside boards)
- Keep `content: "workflowCard+"`

### `src/components/editor/WorkflowLaneView.tsx`
- Minor styling tweaks: remove `my-4` vertical margin (board controls spacing), add `flex-1 min-w-[250px]` for horizontal layout

### `src/components/editor/workflowCommands.ts`
- Replace `insertWorkflowLane` with `insertWorkflowBoard(editor, laneCount)` — creates a board with N lanes (default stage keys: Backlog, In Progress, Review, Done, etc.)
- Keep `insertWorkflowCard` as-is
- Add `addLaneToBoard(editor, boardPos)` — appends a new lane to an existing board

### `src/components/editor/EditorToolbar.tsx`
- Replace the current "Insert Lane" / "Insert Card" dropdown with:
  - "Insert Kanban Board" → opens a small popover/dialog asking how many lanes (2-6, with preset options like "3 lanes" / "4 lanes" / custom)
  - "Add Lane" (visible when cursor is inside a board) → adds lane to current board
  - "Insert Card" stays as-is

### `src/components/editor/WorksheetEditor.tsx`
- Register `WorkflowBoardNode` in extensions array
- Add Turndown rule for the board container

### `src/index.css`
- Add responsive styles for the board's lane container (flex-row on desktop, flex-col on mobile via a utility class or media query)

## Insertion UX
When user clicks "Insert Kanban Board" in toolbar:
1. A small popover appears with lane count options: 3 (default), 4, 5, 6, or custom input
2. On selection, inserts a `workflowBoard` node with that many `workflowLane` children, each with a default stage name and one empty card
3. The "+ Add Lane" button on the board header lets users add more lanes after creation

## Key Technical Details
- `workflowBoard` content rule is `"workflowLane+"` — at least one lane required
- `workflowLane` group changes to `""` (empty) so it's not insertable at document root — only valid inside a board
- Board view uses `NodeViewContent` with a wrapper div that applies `flex flex-row gap-3 overflow-x-auto` on desktop and `flex-col` on mobile via `useIsMobile` or a CSS media query
- Each lane inside the board gets `flex-1 min-w-[250px]` to distribute evenly

