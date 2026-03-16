

# Fix Kanban Board Horizontal Overflow Layout

## Problem
Lanes use `flex: 1 1 0%` which forces them to shrink into the container width. They need fixed widths so the board expands beyond the viewport, with horizontal scrolling to reveal hidden lanes — like a carousel.

## Changes

### `src/index.css`
- Change lane flex from `flex: 1 1 0%` to `flex: 0 0 220px` — lanes get a fixed width and never shrink
- Add `flex-wrap: nowrap` to `.workflow-board-lanes` to prevent wrapping

### `src/components/editor/WorkflowBoardView.tsx`
- On the outer `NodeViewWrapper`, remove any width constraint — let it be full width of the editor
- On the lanes container div, ensure `overflow-x: auto` and `overflow-y: hidden` so horizontal scroll works like a carousel
- Optionally add subtle scroll indicators (left/right fade or scroll hint)

### `src/components/editor/WorkflowLaneView.tsx`
- Replace `flex-1 min-w-[160px]` with `w-[220px] shrink-0` so each lane holds its width

