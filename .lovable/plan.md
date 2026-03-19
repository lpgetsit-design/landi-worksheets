

## Pivot: Design as a Feature Within Notes (Side-by-Side View)

### What Changes

Remove "design" as a separate worksheet type. Instead, any worksheet gets a **Design** button in the header that opens a side-by-side view: editor on the left, design preview on the right. The AI chat panel merges both assistants — a toggle above the input lets users switch between normal editor mode and design mode mid-conversation.

### Layout

```text
┌─────────────────────────────────────────────────────────┐
│ ← Back  [Title]   [Note▾] [Summary] [Design] [Share] [AI] │
├──────────────────────┬──────────────────────────────────┤
│                      │                                  │
│   TipTap Editor      │   Design Preview (iframe)        │
│                      │   (only visible when design      │
│                      │    is active)                     │
│                      │                                  │
├──────────────────────┴──────────────────────────────────┤
│ (AI chat panel on the right, as before)                 │
└─────────────────────────────────────────────────────────┘
```

### Changes by File

**1. `src/pages/WorksheetPage.tsx`** — Major refactor
- Remove `isDesignMode = worksheetType === "design"` logic and the design-specific branch
- Remove the "Design" option from the document type `<Select>` dropdown
- Add a `designActive` boolean state (toggled by a new "Design" button in the header)
- When `designActive` is true, split the content area 50/50: editor left, `DesignPreview` right (using a simple flex layout or the existing resizable panels)
- Always render the `WorksheetEditor` (never swap it out for design-only view)
- Remove the design-specific title input (editor already has its own title)
- Pass a new `designMode` boolean prop to `AIChatPanel` so it knows which system prompt to use
- Add a `designHtml` + `onHtmlChange` prop to `AIChatPanel` for the design tool
- Remove the `DesignChatPanel` import and usage entirely — all chat goes through `AIChatPanel`

**2. `src/components/chat/AIChatPanel.tsx`** — Merge design capabilities
- Add new props: `designMode: boolean`, `designHtml: string`, `onHtmlChange: (html: string) => void`, `worksheetId: string`
- When `designMode` is true, call the `design-chat` edge function instead of `chat`
- Add a toggle button/pill above the text input: "Editor" | "Design" — this sets a local `isDesignMode` state
- When design mode is active, include the `replace_design_html` tool handling in `executeTool` (save to `meta.design_html` in the database, same logic currently in `DesignChatPanel`)
- Merge the tool labels from both panels
- The conversation history persists across mode switches — only the backend endpoint changes for new messages

**3. `src/pages/WorksheetPage.tsx`** — Header updates
- Replace the "Design" select option with a standalone toggle button (e.g., `Paintbrush` icon) that toggles `designActive`
- Keep PDF download button visible when `designActive && designHtml` exists
- Remove conditional rendering that hid the editor in design mode

**4. Remove "design" from document type**
- Remove "Design" from the `<Select>` dropdown in `WorksheetPage`
- Remove "design" from `DocumentType` type in `src/lib/worksheets.ts` (or keep it for backward compat but hide from UI)
- Keep `ENHANCE_PROMPTS` entries for existing types only

**5. `src/components/design/DesignChatPanel.tsx`** — Delete or deprecate
- All its logic moves into `AIChatPanel`. The file can be deleted.

**6. `src/components/design/DesignPreview.tsx`** — No changes needed
- Still used as-is, just rendered side-by-side with the editor instead of replacing it.

### AI Chat Mode Toggle (Key UX Detail)
- Above the input area in AIChatPanel, render two small pill buttons: **Editor** (default) and **Design**
- Selecting "Design" switches the chat to use the `design-chat` edge function and shows a subtle visual indicator (e.g., the input placeholder changes to "Describe your webpage...")
- Selecting "Editor" switches back to the normal `chat` edge function
- The toggle state is local to the chat panel — no URL or database changes needed
- Conversation messages are shared across both modes (the AI sees the full history)

### Migration for Existing Design Worksheets
- Any worksheet with `document_type === "design"` will still load its `meta.design_html` and auto-activate the design panel
- On load, if `meta.design_html` exists, auto-set `designActive = true`

