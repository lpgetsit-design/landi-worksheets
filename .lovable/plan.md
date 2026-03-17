

## Real-time Streaming for All Worksheet AI Tools

### What changes

There are 3 AI-powered worksheet editing flows to make streaming:

1. **Title Generator Button** — currently waits for full response, then sets title
2. **Enhance Content Button** — currently waits for full response, then replaces editor content
3. **Chat Panel worksheet edits** — `replace_worksheet_content` tool applies content all at once

### Approach

**New streaming edge function: `supabase/functions/stream-ai/index.ts`**
- Lightweight streaming proxy to AI gateway (no tools, no agentic loop)
- Accepts `{ prompt, systemPrompt }`, returns raw SSE token stream
- Used by title generator and enhance button (they don't need tool calling)
- Forwards `choices[0].delta.content` chunks as simple `data:` lines

**Editor locking mechanism in `WorksheetEditor.tsx`**
- Add `isAIEditing` state shared across all AI operations
- When active: set `editor.setEditable(false)`, show a subtle overlay/border indicator
- Disable title input, document type selector, toolbar buttons, and slash commands
- Re-enable when streaming completes or errors

**Title Generator — streaming rewrite**
- Fetch from `stream-ai` edge function
- Parse SSE line-by-line, append each delta to the title input in real-time
- User sees characters appearing one by one
- On completion, save the final title to DB

**Enhance Button — streaming rewrite**
- Fetch from `stream-ai` edge function
- Accumulate markdown tokens in a buffer
- Every ~200ms (throttled), convert accumulated markdown to HTML via `marked.parse()`, restore CRM badges, and call `editor.commands.setContent(html)`
- User sees the content being rewritten progressively
- On completion, do final save of content_json/html/md

**Chat Panel edits — progressive reveal**
- When `replace_worksheet_content` tool fires from the chat panel, instead of instantly setting content, simulate progressive typing
- Split the content into chunks (~50 chars), apply them with ~30ms intervals via `setContent()` on progressively longer substrings
- This gives a typing effect without requiring changes to the complex agentic chat edge function
- Lock the editor during the reveal

### Files to create/modify

| File | Action |
|------|--------|
| `supabase/functions/stream-ai/index.ts` | Create — simple streaming proxy |
| `supabase/functions/stream-ai/deno.json` | Create — deno config |
| `src/components/editor/WorksheetEditor.tsx` | Modify — add `isAIEditing` state, streaming title gen, streaming enhance, expose lock handle |
| `src/components/editor/EditorToolbar.tsx` | Modify — accept `disabled` prop to gray out during AI edit |
| `src/pages/WorksheetPage.tsx` | Modify — progressive reveal for `handleApplyEdit` |
| `src/components/chat/AIChatPanel.tsx` | Modify — pass `isAIEditing` flag so chat knows editor is busy |

### Visual indicator during AI editing

- Editor area gets a subtle pulsing border or `opacity-70` overlay
- Title input shows cursor blinking effect during title streaming
- Toolbar shows "AI is editing..." label replacing the Enhance button text
- All user input blocked until streaming finishes

### Technical details

Edge function streaming format (standard OpenAI SSE):
```
data: {"choices":[{"delta":{"content":"token"}}]}
data: [DONE]
```

Client SSE parsing (shared helper):
```typescript
async function streamFromAI(url, body, onDelta, onDone) {
  const resp = await fetch(url, { method: "POST", ... });
  const reader = resp.body.getReader();
  // parse line-by-line, extract choices[0].delta.content
}
```

Throttled editor update for enhance:
```typescript
let buffer = "";
let lastUpdate = 0;
onDelta: (chunk) => {
  buffer += chunk;
  if (Date.now() - lastUpdate > 200) {
    const html = marked.parse(buffer);
    editor.commands.setContent(restoreBadges(html));
    lastUpdate = Date.now();
  }
}
```

