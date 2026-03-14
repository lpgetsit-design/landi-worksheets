

## Render CRM Entity Badges in AI Chat Responses

### Problem
When the AI assistant returns text containing `[[CRM:entityType:entityId:label]]` tokens, they display as raw text in chat messages instead of styled inline badges.

### Approach
Create a shared `CrmBadgeInline` component (simpler version of `CrmBadgeView` without TipTap dependency) and a text parser utility, then use them in the chat message rendering.

### Changes

| File | Change |
|------|--------|
| `src/components/chat/CrmBadgeInline.tsx` | **New.** Standalone inline badge component (no TipTap `NodeViewWrapper`). Renders the same styled `span` with entity ID, label, and type tag. No hover card needed initially — keep it lightweight. |
| `src/components/chat/CrmChatContent.tsx` | **New.** Component that takes a markdown string, splits it on `[[CRM:...]]` regex, and renders text segments via `ReactMarkdown` and badge segments via `CrmBadgeInline`. |
| `src/components/chat/AIChatPanel.tsx` | Replace the `<ReactMarkdown>{msg.content}</ReactMarkdown>` block (~line 253) with `<CrmChatContent content={msg.content} />`. |

### Parsing Logic
```text
Regex: /\[\[CRM:(\w+):(\d+):([^\]]+)\]\]/g

Input:  "Here is [[CRM:Candidate:12345:John Smith]] and some text"
Output: ["Here is ", <CrmBadgeInline type="Candidate" id="12345" label="John Smith" />, " and some text"]
```

### Badge Style
Reuse the same visual style from `CrmBadgeView`: `inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium` — just without the `NodeViewWrapper` and `contentEditable` props.

