

## Plan: Add Hover Card to CRM Badges

### Problem
CRM badges display only entity type, ID, and name. The full metadata (stored in the `metadata` attribute) is not visible to users.

### Solution
Convert the `CrmBadgeNode` from a pure HTML-rendered TipTap node to one using a **React NodeView**, which allows rendering a `HoverCard` (from the existing `@radix-ui/react-hover-card` dependency) on hover. The hover card will display a styled profile card showing all available metadata fields.

### Changes

**1. Create `src/components/editor/CrmBadgeView.tsx`** — React component for the NodeView

- Renders the existing badge inline span
- Wraps it in a `HoverCard` from `@/components/ui/hover-card`
- On hover, shows a profile card with:
  - Entity type badge + ID at the top
  - Name as title
  - Key metadata fields displayed in a clean card layout (email, phone, status, company, title, etc.)
  - Handles different entity types (Candidate vs Contact vs Client vs Job) with appropriate field labels
- Uses `NodeViewWrapper` from `@tiptap/react` with `as="span"` for inline rendering

**2. Update `src/components/editor/CrmBadgeNode.ts`**

- Add `addNodeView()` method using `ReactNodeViewRenderer` to render `CrmBadgeView`
- Keep `renderHTML()` for serialization/copy-paste

**3. No other files need changes**

The metadata is already stored in the node attributes via the slash command insertion flow. The hover card simply reads `node.attrs.metadata` and displays it.

### Profile Card Layout

```text
┌─────────────────────────────┐
│ [Candidate]        ID: 249884│
│                              │
│  Leo Megaa                   │
│  Software Engineer           │
│                              │
│  📧 leo@email.com            │
│  📱 555-1234                 │
│  🏢 Acme Corp               │
│  📍 New York, NY             │
│  ● Actively Looking          │
└─────────────────────────────┘
```

### Files
- **Create** `src/components/editor/CrmBadgeView.tsx`
- **Modify** `src/components/editor/CrmBadgeNode.ts` — add `addNodeView` with `ReactNodeViewRenderer`

