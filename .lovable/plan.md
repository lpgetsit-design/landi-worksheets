

## Redesign: Agentic AI Assistant with Tool Calling

### Current State
The AI panel has two modes (Q&A and Edit) with manual "Apply" buttons. The edge function uses a simple streaming chat with no tool-calling capability.

### New Architecture

Replace the dual-mode chat with a single unified conversation where the AI autonomously decides when to use tools. The AI gateway supports OpenAI-compatible tool calling, so we use that.

#### Tools the AI Agent Will Have

1. **`replace_worksheet_content`** — Replaces entire worksheet content with new markdown
2. **`update_worksheet_title`** — Changes the worksheet title
3. **`update_document_type`** — Changes the document type (note/skill/prompt/template)

The AI decides when to call these tools based on user intent. Multi-step edits happen via multiple tool calls in sequence.

### Changes

#### 1. Edge Function (`supabase/functions/chat/index.ts`)

- Remove `mode` parameter entirely
- Single system prompt that describes the AI as an assistant with tool access, includes current worksheet content/title/type
- Define tools array with the 3 tools above using OpenAI function-calling format
- Use **non-streaming** for tool-call responses (tool calls don't stream well), streaming for text-only responses
- Implement an **agentic loop**: after the AI returns tool calls, execute them server-side (or return them to client), append tool results, and re-call the AI until it produces a final text response
- Since tools modify client-side state, the edge function returns tool calls to the client for execution, then the client sends results back

#### 2. AIChatPanel (`src/components/chat/AIChatPanel.tsx`)

- Remove mode toggle (Q&A/Edit tabs), `appliedMessageId`, `previousContent`, `extractEditContent`, all mode-related state
- Add new message type for tool calls and tool results in the Message interface
- Implement agentic loop on client:
  1. Send messages to edge function
  2. If response contains `tool_calls`, render a pending action indicator, execute each tool call locally (call `onApplyEdit`, `onUpdateTitle`, `onUpdateDocumentType`), show confirmation in chat
  3. Send tool results back to edge function for the AI to continue
  4. Repeat until AI responds with plain text (no more tool calls)
- Show tool actions inline in chat (e.g., "Updated worksheet content", "Changed title to X") with a subtle indicator

#### 3. WorksheetPage (`src/pages/WorksheetPage.tsx`)

- Pass additional callbacks to AIChatPanel: `onUpdateTitle`, `onUpdateDocumentType`
- These callbacks update local state and persist to DB
- Remove mode-related logic

#### 4. Message Flow

```text
User: "Fix the grammar and change the title to 'My Notes'"
  │
  ▼
Edge function (non-streaming, tools enabled)
  │
  ▼
AI returns tool_calls:
  [replace_worksheet_content({content: "..."}),
   update_worksheet_title({title: "My Notes"})]
  │
  ▼
Client executes tools, shows actions in chat
Client sends tool results back
  │
  ▼
AI returns final text: "Done! I fixed the grammar and updated the title."
```

### Files to Modify

- **`supabase/functions/chat/index.ts`** — Rewrite with tool definitions, agentic loop support, single system prompt
- **`src/components/chat/AIChatPanel.tsx`** — Remove modes, add client-side tool execution loop, inline action rendering
- **`src/pages/WorksheetPage.tsx`** — Add title/type update callbacks, remove mode references

