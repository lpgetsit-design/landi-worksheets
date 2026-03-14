

## Plan: Integrate Bullhorn MCP Tools as Agentic Actions in AI Chat

### Overview
Expose the Bullhorn MCP tools (search candidates, get candidate profile, search jobs, get job summary, search placements, etc.) as server-side tools in the chat edge function. The AI can then autonomously break down user requests into multi-step Bullhorn queries, chain results, and bring the user into the loop on errors or ambiguous results.

### Architecture

The existing chat edge function already has a server-side agentic loop pattern (execute server tools, return client tools). We extend this with new Bullhorn CRM tools that are clearly separated from the worksheet-editing tools.

```text
User → AIChatPanel → chat edge function
                         ├── CLIENT_TOOLS (worksheet editing - unchanged)
                         ├── SERVER_TOOLS: lookup_bullhorn_entity (existing)
                         └── SERVER_TOOLS: NEW Bullhorn agentic tools
                              ├── search_candidates
                              ├── get_candidate_profile
                              ├── search_jobs
                              ├── get_job_summary
                              ├── search_placements
                              └── get_placement_summary
```

### Changes

#### 1. `supabase/functions/bullhorn-proxy/index.ts` — Add new API actions

Add new action handlers that call the Bullhorn REST API for:
- `search_candidates` — Lucene query search on `/search/Candidate`
- `get_candidate_profile` — GET `/entity/Candidate/{id}` with detailed fields
- `search_jobs` — Lucene query search on `/search/JobOrder`
- `get_job_summary` — GET `/entity/JobOrder/{id}` with summary fields
- `search_placements` — Lucene query search on `/search/Placement`
- `get_placement_summary` — GET `/entity/Placement/{id}` with summary fields

Each action accepts structured parameters, builds the appropriate Bullhorn REST URL, and returns JSON results. Reuses existing `getBullhornSession()` auth logic.

#### 2. `supabase/functions/chat/index.ts` — Add new server-side tools + enhanced system prompt

**New SERVER_TOOLS** (added alongside existing `lookup_bullhorn_entity`):
- `search_bullhorn_candidates` — Search candidates by skills, location, experience, etc.
- `get_bullhorn_candidate_profile` — Get full candidate profile by ID
- `search_bullhorn_jobs` — Search job orders by title, status, location
- `get_bullhorn_job_summary` — Get job details by ID
- `search_bullhorn_placements` — Search placements by status, candidate, job
- `get_bullhorn_placement_summary` — Get placement details by ID

**Each tool executor** calls `bullhorn-proxy` with the appropriate action and parameters.

**Increase MAX_LOOPS** from 5 to 8 to support multi-step agentic workflows.

**Enhanced system prompt** with a new section:

```
AGENTIC CRM TASKS:
- You have tools for searching and retrieving detailed data from the Bullhorn CRM.
- When the user gives a complex task (e.g. "find Java developers in NYC with 5+ years 
  and check if any are placed"), break it into sequential steps using the available tools.
- After each tool call, analyze results and decide the next step.
- If a search returns too many or zero results, adjust and retry or ask the user to refine.
- If an error occurs, explain what happened and ask the user how to proceed.
- Present results in a clear, formatted summary. Use [[CRM:...]] badges for entities.
- These tools are for INFORMATION RETRIEVAL ONLY — separate from worksheet editing tools.
```

#### 3. `src/components/chat/AIChatPanel.tsx` — Update tool labels for new tools

Add labels for new Bullhorn tools in `toolLabels`:
```typescript
search_bullhorn_candidates: "Searched candidates",
get_bullhorn_candidate_profile: "Retrieved candidate profile",
search_bullhorn_jobs: "Searched jobs",
get_bullhorn_job_summary: "Retrieved job details",
search_bullhorn_placements: "Searched placements",
get_bullhorn_placement_summary: "Retrieved placement details",
```

### Tool Separation
- **Worksheet tools** (client-side): `replace_worksheet_content`, `update_worksheet_title`, `update_document_type` — unchanged
- **Badge lookup** (server-side): `lookup_bullhorn_entity` — existing, for badge creation only
- **CRM agentic tools** (server-side): new `search_bullhorn_*` / `get_bullhorn_*` — for information retrieval tasks

The system prompt explicitly instructs the AI to use CRM tools for data tasks and worksheet tools only for content editing, keeping them separate.

### Error Handling & Human-in-the-Loop
- Tool executors return structured error JSON that the AI can interpret
- System prompt instructs AI to surface errors to the user and ask for guidance
- If Bullhorn auth fails (401), the proxy retries once then returns error
- If results are ambiguous (multiple matches), AI asks user to clarify

