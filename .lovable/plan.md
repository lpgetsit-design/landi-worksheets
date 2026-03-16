

# Document-Native Workflow System — Implementation Plan

This plan covers **Phase 1 (Foundation)** and **Phase 2 (Metadata Operations)** to deliver a working workflow card and lane system inside the existing Tiptap editor. Phases 3-6 are outlined but deferred.

---

## What Gets Built

Two new Tiptap custom nodes (`workflowLane` and `workflowCard`) rendered as React node views, with insertion commands, attribute-driven metadata editing, a side inspector panel, and backend persistence via projections.

---

## Architecture

```text
┌─────────────────────────────────────────────┐
│  Tiptap Document (JSON source of truth)     │
│                                             │
│  paragraph ...                              │
│  workflowLane { title, stageKey, ... }      │
│    ├─ workflowCard { id, status, ... }      │
│    │    └─ (editable title + description)   │
│    ├─ workflowCard { ... }                  │
│    └─ ...                                   │
│  paragraph ...                              │
│  workflowLane { ... }                       │
│    └─ workflowCard { ... }                  │
└─────────────────────────────────────────────┘
         │ onUpdate (debounced)
         ▼
┌─────────────────────────────────────────────┐
│  Supabase                                   │
│  worksheets.content_json  (raw doc JSON)    │
│  workflow_cards  (projection table)         │
│  workflow_lanes  (projection table)         │
└─────────────────────────────────────────────┘
```

---

## Technical Plan

### 1. New Tiptap Nodes

**`workflowLane`** — block container node
- Group: `block`
- Content: `workflowCard+` (one or more cards)
- Attributes: `id`, `title`, `stageKey`, `wipLimit`, `colorToken`, `sortMode`
- React node view: header bar (non-editable) with lane title, card count, WIP indicator; cards render as nested content
- File: `src/components/editor/WorkflowLaneNode.ts`
- View: `src/components/editor/WorkflowLaneView.tsx`

**`workflowCard`** — block node inside lanes
- Group: `block` (only valid inside `workflowLane`)
- Content: allows inline content for title region
- Attributes: `id`, `title`, `description`, `status`, `priority`, `assigneeId`, `assigneeLabel`, `dueDate`, `labels` (JSON string), `createdAt`, `updatedAt`, `blockedBy` (JSON string), `childTaskIds` (JSON string), `isCollapsed`, `sourceType`, `sourceId`
- React node view: card chrome with status badge, priority dot, assignee pill, due date, collapse toggle; title is editable inline, description in a secondary region
- File: `src/components/editor/WorkflowCardNode.ts`
- View: `src/components/editor/WorkflowCardView.tsx`

Both nodes follow the same pattern as the existing `CrmBadgeNode` — define `Node.create()` with `addAttributes`, `parseHTML`, `renderHTML`, `addNodeView` using `ReactNodeViewRenderer`.

### 2. React Node Views

**WorkflowCardView.tsx**
- `NodeViewWrapper` with `contenteditable="false"` outer shell
- Editable title via `NodeViewContent` for the title content region
- Non-editable metadata bar: status select, priority select, assignee pill, due date picker, labels
- Collapse toggle hides description
- All metadata changes call `updateAttributes` on the node
- Action menu: duplicate, delete, move to stage (dropdown of sibling lanes)

**WorkflowLaneView.tsx**
- `NodeViewWrapper` as a styled container
- Non-editable header with lane title (inline editable via input), card count, optional WIP limit badge
- `NodeViewContent` renders child cards
- "Add Card" button at bottom inserts a new `workflowCard` node

### 3. Editor Integration

**Register nodes** in `WorksheetEditor.tsx`:
- Import and add `WorkflowLaneNode` and `WorkflowCardNode` to the extensions array
- No changes to existing nodes

**Slash command** — extend `SlashCommandMenu.tsx`:
- Add a "Workflow" section with options: "Insert Lane", "Insert Card"
- Or: add dedicated toolbar buttons in `EditorToolbar.tsx` (dropdown like the Table button)

**Toolbar** — add a workflow dropdown in `EditorToolbar.tsx`:
- Insert Lane (creates lane with one empty card)
- Insert Card (at cursor, inside current lane)

**Editor commands** — helper functions:
- `insertWorkflowLane(editor, title, stageKey)` — uses `insertContent` with JSON payload
- `insertWorkflowCard(editor, attrs)` — inserts card node with defaults (`id: crypto.randomUUID()`, `status: "backlog"`, `createdAt: new Date().toISOString()`)
- `moveCardToLane(editor, cardPos, targetLanePos)` — cut/paste node between lanes
- `duplicateCard(editor, cardPos)` — copy node with new ID

### 4. Side Inspector Panel

New component `WorkflowCardInspector.tsx`:
- Opens when a workflow card is selected (via editor selection events)
- Shows full metadata form: title, description (textarea), status, priority, assignee search, due date (calendar), labels (tag input), blocked-by references
- Changes dispatch `updateAttributes` back to the Tiptap node
- Renders in the same panel area as the AI chat (toggled)

### 5. Database Changes (Migrations)

**New table: `workflow_cards`** (projection)
```sql
CREATE TABLE public.workflow_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_id uuid NOT NULL REFERENCES public.worksheets(id) ON DELETE CASCADE,
  card_node_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  description text,
  status text NOT NULL DEFAULT 'backlog',
  priority text DEFAULT 'medium',
  assignee_id text,
  assignee_label text,
  due_date timestamptz,
  labels jsonb DEFAULT '[]',
  lane_stage_key text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.workflow_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own worksheet cards" ON public.workflow_cards
  FOR ALL TO authenticated
  USING (is_worksheet_owner(worksheet_id, auth.uid()))
  WITH CHECK (is_worksheet_owner(worksheet_id, auth.uid()));
```

**New table: `workflow_lanes`** (projection)
```sql
CREATE TABLE public.workflow_lanes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_id uuid NOT NULL REFERENCES public.worksheets(id) ON DELETE CASCADE,
  lane_node_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  stage_key text NOT NULL,
  wip_limit integer,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.workflow_lanes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own worksheet lanes" ON public.workflow_lanes
  FOR ALL TO authenticated
  USING (is_worksheet_owner(worksheet_id, auth.uid()))
  WITH CHECK (is_worksheet_owner(worksheet_id, auth.uid()));
```

### 6. Projection Sync

Extend `src/lib/worksheets.ts`:
- Add `syncWorkflowProjections(worksheetId, contentJson)` — extracts `workflowLane` and `workflowCard` nodes from Tiptap JSON, deletes existing projections, upserts new rows
- Called alongside existing `syncWorksheetEntities` in the editor's `onUpdate` debounce

### 7. Turndown Serialization

Add custom Turndown rules for `workflowLane` and `workflowCard` so markdown export preserves structured data (similar to the CRM badge rule). Cards serialize as `[[CARD:id:title:status]]` placeholders.

---

## Files to Create
- `src/components/editor/WorkflowLaneNode.ts`
- `src/components/editor/WorkflowLaneView.tsx`
- `src/components/editor/WorkflowCardNode.ts`
- `src/components/editor/WorkflowCardView.tsx`
- `src/components/editor/WorkflowCardInspector.tsx`
- `src/components/editor/workflowCommands.ts`

## Files to Modify
- `src/components/editor/WorksheetEditor.tsx` — register new nodes, add projection sync
- `src/components/editor/EditorToolbar.tsx` — add workflow insertion dropdown
- `src/lib/worksheets.ts` — add projection sync function
- `src/pages/WorksheetPage.tsx` — add inspector panel toggle
- Database migration for `workflow_cards` and `workflow_lanes` tables

---

## Deferred to Later Phases
- **Phase 3**: Drag handles + cross-lane drag-and-drop
- **Phase 4**: Workflow event/audit trail table, version conflict handling
- **Phase 5**: Subtasks, dependencies, blockers, templates, automation
- **Phase 6**: Real-time collaboration

