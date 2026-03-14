

## Inline CRM Entity Badges via Slash Commands + Bullhorn FastFind

### Overview

When the user types `/` in the TipTap editor, a command menu appears with entity type options (Candidate, Client Contact, Client Corporation, Job Order). Selecting one opens a search input that queries Bullhorn's FastFind API via an edge function proxy. Selecting a result inserts an inline badge node into the editor containing the entity's metadata.

### Architecture

```text
User types "/" → Slash command menu → Select entity type
  → Search input → Debounced query
  → bullhorn-proxy edge function → Bullhorn /find API
  → Results list → User selects entity
  → Insert custom TipTap inline node (CRM badge)
```

### Prerequisites: Bullhorn Credentials

Bullhorn OAuth requires 4 secrets: `BULLHORN_CLIENT_ID`, `BULLHORN_CLIENT_SECRET`, `BULLHORN_USERNAME`, `BULLHORN_PASSWORD`. The edge function will use the REST login flow (username/password grant for server-side, which Bullhorn supports as an alternative to the redirect-based OAuth flow). We'll request these via the `add_secret` tool before implementation.

### Components to Build

#### 1. Edge Function: `supabase/functions/bullhorn-proxy/index.ts`

- Handles Bullhorn authentication (OAuth token + REST session login)
- Caches `BhRestToken` and `restUrl` in memory (short-lived, edge function scope)
- Exposes a single action: `fastfind`
- Request: `{ action: "fastfind", query: "smith", countPerEntity: 5 }`
- Calls `GET {restUrl}/find?query=...&countPerEntity=5&meta=full&BhRestToken=...`
- Returns raw Bullhorn response `{ data: [...], meta: {...} }`
- CORS headers included
- `verify_jwt = false` in config.toml

#### 2. Custom TipTap Node: `src/components/editor/CrmBadgeNode.ts`

- Custom inline `Node` extension called `crmBadge`
- Attributes: `entityType`, `entityId`, `label`, `metadata` (JSON blob of raw entity data)
- Renders as an inline `<span>` styled as a badge with entity type prefix (e.g., "Candidate: John Smith")
- Not editable inline — deleted as a whole unit
- Stored in TipTap JSON, persisted via existing `content_json` save flow

#### 3. Slash Command Extension: `src/components/editor/SlashCommandExtension.ts`

- TipTap extension using the `@tiptap/suggestion` utility
- Triggers on `/` character
- Shows a popup menu with entity types: Candidate, ClientContact, ClientCorporation, JobOrder
- On entity type selection, transitions to a search input mode within the same popup
- Debounced search (300ms) calls the `bullhorn-proxy` edge function
- Results rendered as a list; clicking one inserts the `crmBadge` node

#### 4. Slash Command UI Component: `src/components/editor/SlashCommandMenu.tsx`

- React component rendered as the suggestion popup
- Two states: (a) entity type picker, (b) search results
- Uses existing shadcn Command component for keyboard navigation
- Displays entity results with type badges and key fields (name, title, etc.)

#### 5. Hook: `src/hooks/useBullhornSearch.ts`

- `useBullhornSearch(query, enabled)` hook
- Calls `supabase.functions.invoke("bullhorn-proxy", { body: { action: "fastfind", query, countPerEntity: 5 } })`
- Returns `{ data, loading, error }`
- Debounces internally

#### 6. Editor Integration: `src/components/editor/WorksheetEditor.tsx`

- Register `CrmBadgeNode` and `SlashCommandExtension` in the TipTap extensions array
- No other changes needed — badge data persists automatically through existing `content_json` save

### Files to Create
- `supabase/functions/bullhorn-proxy/index.ts` — Bullhorn auth + FastFind proxy
- `supabase/functions/bullhorn-proxy/deno.json` — imports
- `src/components/editor/CrmBadgeNode.ts` — custom TipTap inline node
- `src/components/editor/SlashCommandExtension.ts` — suggestion trigger on `/`
- `src/components/editor/SlashCommandMenu.tsx` — popup UI for entity search
- `src/hooks/useBullhornSearch.ts` — search hook

### Files to Modify
- `supabase/config.toml` — add `[functions.bullhorn-proxy]` with `verify_jwt = false`
- `src/components/editor/WorksheetEditor.tsx` — add new extensions to editor config

### Badge Rendering

The badge will be monochrome (consistent with the project's black/white design). Entity type shown as a small prefix label:

```text
[Candidate] John Smith    [Job] Senior Engineer    [Client] Acme Corp
```

### Data Flow for Badge Metadata

Each badge stores the full raw entity data from Bullhorn in its `metadata` attribute. This means the worksheet content_json contains all CRM context inline, available for the AI assistant to reference when the user asks questions about their worksheet content.

### Secret Requirements

Before building, we need 4 Bullhorn secrets added:
- `BULLHORN_CLIENT_ID`
- `BULLHORN_CLIENT_SECRET`  
- `BULLHORN_USERNAME`
- `BULLHORN_PASSWORD`

