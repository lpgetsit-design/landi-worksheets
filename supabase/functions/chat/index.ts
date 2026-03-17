const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Client-side tools (worksheet editing) ───

const CLIENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "replace_worksheet_content",
      description:
        "Replace the entire worksheet content with new markdown. Use when the user asks to edit, rewrite, fix, format, or change their worksheet content.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "The full updated worksheet content in markdown format" },
        },
        required: ["content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_worksheet_title",
      description: "Change the worksheet title.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "The new title" },
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_document_type",
      description: "Change the worksheet document type. Valid values: note, skill, prompt, template.",
      parameters: {
        type: "object",
        properties: {
          document_type: {
            type: "string",
            enum: ["note", "skill", "prompt", "template"],
            description: "The new document type",
          },
        },
        required: ["document_type"],
        additionalProperties: false,
      },
    },
  },
];

// ─── Server-side tools (CRM data retrieval) ───

const SERVER_TOOLS = [
  {
    type: "function",
    function: {
      name: "lookup_bullhorn_entity",
      description:
        "Search the Bullhorn CRM for an entity by name or partial match. Returns matching entities with their type, ID, and label. Use ONLY for name-based searches when you don't know the entity type or ID.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Name or partial match string to search for" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "batch_resolve_entities",
      description:
        "Resolve multiple Bullhorn entities by their type and ID in a single call. Use this when you have specific entity types and IDs (e.g. from existing badges, or numeric IDs mentioned in text). Much faster than calling individual lookup tools.",
      parameters: {
        type: "object",
        properties: {
          entities: {
            type: "array",
            description: "Array of entities to resolve",
            items: {
              type: "object",
              properties: {
                entityType: { type: "string", description: "Bullhorn entity type: Candidate, ClientContact, ClientCorporation, JobOrder, or Placement" },
                entityId: { type: "string", description: "Numeric Bullhorn entity ID" },
              },
              required: ["entityType", "entityId"],
            },
          },
        },
        required: ["entities"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_bullhorn_candidates",
      description:
        "Search Bullhorn CRM for candidates using a Lucene query. Always include 'isDeleted:0' in queries.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Lucene search query. Always include isDeleted:0." },
          count: { type: "number", description: "Max results to return (default 10, max 50)" },
          fields: { type: "string", description: "Comma-separated fields to return. Optional." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_bullhorn_candidate_profile",
      description:
        "Get a detailed candidate profile from Bullhorn by numeric candidate ID.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Numeric Bullhorn Candidate ID" },
          fields: { type: "string", description: "Comma-separated fields. Optional." },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_bullhorn_jobs",
      description:
        "Search Bullhorn CRM for job orders using a Lucene query. Always include 'isDeleted:false'.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Lucene search query. Always include isDeleted:false." },
          count: { type: "number", description: "Max results (default 10, max 50)" },
          fields: { type: "string", description: "Comma-separated fields. Optional." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_bullhorn_job_summary",
      description: "Get detailed job order information from Bullhorn by numeric JobOrder ID.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Numeric Bullhorn JobOrder ID" },
          fields: { type: "string", description: "Comma-separated fields. Optional." },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_bullhorn_placements",
      description:
        "Search Bullhorn CRM for placements using a Lucene query.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Lucene search query" },
          count: { type: "number", description: "Max results (default 10, max 50)" },
          fields: { type: "string", description: "Comma-separated fields. Optional." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_bullhorn_placement_summary",
      description: "Get detailed placement information from Bullhorn by numeric Placement ID.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Numeric Bullhorn Placement ID" },
          fields: { type: "string", description: "Comma-separated fields. Optional." },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
];

const ALL_TOOLS = [...CLIENT_TOOLS, ...SERVER_TOOLS];
const SERVER_TOOL_NAMES = new Set(SERVER_TOOLS.map((t) => t.function.name));
const MAX_LOOPS = 8;

// ─── Friendly tool labels ───
const TOOL_LABELS: Record<string, string> = {
  lookup_bullhorn_entity: "Looking up CRM entity",
  batch_resolve_entities: "Resolving CRM entities",
  search_bullhorn_candidates: "Searching candidates",
  get_bullhorn_candidate_profile: "Retrieving candidate profile",
  search_bullhorn_jobs: "Searching job orders",
  get_bullhorn_job_summary: "Retrieving job details",
  search_bullhorn_placements: "Searching placements",
  get_bullhorn_placement_summary: "Retrieving placement details",
  replace_worksheet_content: "Updating worksheet",
  update_worksheet_title: "Changing title",
  update_document_type: "Changing document type",
};

// ─── Server-side tool executors ───

async function callBullhornProxy(action: string, params: Record<string, any>): Promise<string> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/bullhorn-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ action, ...params }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return JSON.stringify({ error: `Bullhorn API error (${resp.status}): ${text}` });
    }
    return JSON.stringify(await resp.json());
  } catch (e) {
    return JSON.stringify({ error: `Bullhorn request failed: ${e instanceof Error ? e.message : "Unknown"}` });
  }
}

async function executeServerTool(name: string, argsJson: string): Promise<string> {
  try {
    const args = JSON.parse(argsJson);
    switch (name) {
      case "lookup_bullhorn_entity":
        return await callBullhornProxy("entity_lookup", { query: args.query });
      case "batch_resolve_entities":
        return await callBullhornProxy("batch_get_entities", { entities: args.entities });
      case "search_bullhorn_candidates":
        return await callBullhornProxy("search_candidates", { query: args.query, count: args.count, fields: args.fields });
      case "get_bullhorn_candidate_profile":
        return await callBullhornProxy("get_candidate_profile", { id: args.id, fields: args.fields });
      case "search_bullhorn_jobs":
        return await callBullhornProxy("search_jobs", { query: args.query, count: args.count, fields: args.fields });
      case "get_bullhorn_job_summary":
        return await callBullhornProxy("get_job_summary", { id: args.id, fields: args.fields });
      case "search_bullhorn_placements":
        return await callBullhornProxy("search_placements", { query: args.query, count: args.count, fields: args.fields });
      case "get_bullhorn_placement_summary":
        return await callBullhornProxy("get_placement_summary", { id: args.id, fields: args.fields });
      default:
        return JSON.stringify({ error: `Unknown server tool: ${name}` });
    }
  } catch (e) {
    return JSON.stringify({ error: `Tool execution error: ${e instanceof Error ? e.message : "Unknown"}` });
  }
}

// ─── SSE helpers ───

function sseEvent(type: string, data: any): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ─── Stream AI gateway response, forwarding content tokens and accumulating tool calls ───

interface StreamResult {
  content: string;
  toolCalls: any[];
}

async function streamAIResponse(
  apiMessages: any[],
  apiKey: string,
  send: (type: string, data: any) => void,
): Promise<StreamResult> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-5-mini",
      messages: apiMessages,
      tools: ALL_TOOLS,
      parallel_tool_calls: true,
      stream: true,
    }),
  });

  if (!response.ok) {
    const status = response.status;
    const t = await response.text();
    console.error("AI gateway error:", status, t);
    if (status === 429) {
      throw new Error("RATE_LIMIT");
    } else if (status === 402) {
      throw new Error("PAYMENT_REQUIRED");
    }
    throw new Error("AI_GATEWAY_ERROR");
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const toolCallDeltas: Record<number, { id: string; function: { name: string; arguments: string } }> = {};
  let firstContentSent = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);

      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") break;

      try {
        const parsed = JSON.parse(jsonStr);
        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;

        // Stream content tokens to client
        if (delta.content) {
          if (!firstContentSent) {
            send("status", { phase: "responding", message: "AI is responding..." });
            firstContentSent = true;
          }
          content += delta.content;
          send("token", { content: delta.content });
        }

        // Accumulate tool call deltas
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!toolCallDeltas[idx]) {
              toolCallDeltas[idx] = { id: tc.id || "", function: { name: "", arguments: "" } };
            }
            if (tc.id) toolCallDeltas[idx].id = tc.id;
            if (tc.function?.name) toolCallDeltas[idx].function.name += tc.function.name;
            if (tc.function?.arguments) toolCallDeltas[idx].function.arguments += tc.function.arguments;
          }
        }
      } catch {
        // Incomplete JSON — put back
        buffer = line + "\n" + buffer;
        break;
      }
    }
  }

  const toolCalls = Object.values(toolCallDeltas);
  return { content, toolCalls };
}

// ─── Main handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, worksheetTitle, worksheetContent, worksheetType } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are an expert AI assistant embedded in a worksheet editor app. You can both answer questions AND take actions using the tools available to you.

Current worksheet state:
- Title: "${worksheetTitle || "Untitled"}"
- Document type: ${worksheetType || "note"}
- Content:
${worksheetContent || "(empty)"}

WORKSHEET EDITING:
- When the user asks you to edit, fix, rewrite, or change the worksheet, use the replace_worksheet_content tool with the FULL updated markdown content.
- When asked to change the title, use update_worksheet_title.
- When asked to change the document type, use update_document_type.
- You can call multiple tools in a single response for multi-step edits.
- When the user asks questions or wants information, just respond normally without using tools.
- After making changes, briefly confirm what you did.
- Always preserve content the user didn't ask you to change.

CRM BADGES:
- The content may contain CRM entity references in the format [[CRM:entityType:entityId:label]], for example [[CRM:Candidate:12345:John Smith]].
- These are linked records from the Bullhorn CRM system. They render as inline badges in the editor.
- You MUST preserve them exactly as-is in your output, including their format and all data fields.
- Do NOT modify, reformat, split, merge, or remove badge placeholders unless the user explicitly asks you to.
- When rewriting or restructuring content, keep every [[CRM:...]] token intact and in context.

RESOLVING ENTITY REFERENCES — CRITICAL:
- When you see bare numeric IDs in the worksheet content that could be Bullhorn entity references (e.g. "Candidate 12345", "Job #67890"), you MUST resolve them to proper [[CRM:...]] badges.
- ALWAYS use batch_resolve_entities when you need to resolve multiple entities at once.
- For batch_resolve_entities, you need the entityType and entityId. Common entity types: Candidate, ClientContact, ClientCorporation, JobOrder, Placement.
- If you're unsure of the entity type for a numeric ID, use lookup_bullhorn_entity for that specific case.
- NEVER call lookup_bullhorn_entity or individual get tools multiple times in sequence when batch_resolve_entities can handle them all at once.
- After resolving, embed each entity using [[CRM:entityType:entityId:label]] format.

AGENTIC CRM TASKS:
- You have powerful tools for searching and retrieving detailed data from the Bullhorn CRM:
  * search_bullhorn_candidates — find candidates by skills, location, experience, name
  * get_bullhorn_candidate_profile — get full profile for a specific candidate
  * search_bullhorn_jobs — find job orders by title, status, client, location
  * get_bullhorn_job_summary — get full details for a specific job
  * search_bullhorn_placements — find placements by status, candidate, job
  * get_bullhorn_placement_summary — get details for a specific placement
  * batch_resolve_entities — resolve multiple entity type+ID pairs to labels in ONE call
- When the user gives a complex CRM task, break it into sequential steps using these tools.
- Chain tool calls: search first, then get details on specific results.
- IMPORTANT: Call as many tools as possible in PARALLEL in a single response.
- If a search returns zero results, try broadening the query or ask the user to refine.
- Present results in a clear, formatted summary with bullet points or tables.
- Use [[CRM:entityType:entityId:label]] badges for all entity references in your responses.
- These CRM tools are for INFORMATION RETRIEVAL — keep them separate from worksheet editing tools.
- Only use worksheet tools when the user explicitly asks to modify the worksheet content.`;

    let apiMessages: any[] = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    // Use a ReadableStream to send SSE events
    const stream = new ReadableStream({
      async start(controller) {
        const send = (type: string, data: any) => {
          controller.enqueue(new TextEncoder().encode(sseEvent(type, data)));
        };
        // Flush HTTP buffers immediately
        controller.enqueue(new TextEncoder().encode(`: connected\n\n`));

        try {
          for (let loop = 0; loop < MAX_LOOPS; loop++) {
            if (loop === 0) {
              send("status", { step: 1, phase: "thinking", message: "Reading your worksheet..." });
            } else {
              send("status", { step: loop + 1, phase: "thinking", message: "Analyzing results..." });
            }

            // Start keepalive pings every 3s
            let keepAlive = true;
            const pingInterval = setInterval(() => {
              if (keepAlive) {
                try { controller.enqueue(new TextEncoder().encode(`: ping\n\n`)); } catch { /* closed */ }
              }
            }, 3000);

            let result: StreamResult;
            try {
              result = await streamAIResponse(apiMessages, LOVABLE_API_KEY, send);
            } catch (e: any) {
              keepAlive = false;
              clearInterval(pingInterval);
              if (e.message === "RATE_LIMIT") {
                send("error", { error: "Rate limit exceeded. Please try again in a moment." });
              } else if (e.message === "PAYMENT_REQUIRED") {
                send("error", { error: "AI credits exhausted. Please add funds in Settings → Workspace → Usage." });
              } else {
                send("error", { error: "AI gateway error" });
              }
              controller.close();
              return;
            } finally {
              keepAlive = false;
              clearInterval(pingInterval);
            }

            const { content, toolCalls } = result;
            const serverCalls = toolCalls.filter((tc) => SERVER_TOOL_NAMES.has(tc.function.name));
            const clientCalls = toolCalls.filter((tc) => !SERVER_TOOL_NAMES.has(tc.function.name));

            // No server tools — return final message and done
            if (serverCalls.length === 0) {
              const finalMessage: any = { role: "assistant", content: content || "" };
              if (clientCalls.length > 0) finalMessage.tool_calls = clientCalls;
              send("done", { message: finalMessage });
              controller.close();
              return;
            }

            // We have server tools — stream tool call info with friendly labels
            const toolCallLabels = serverCalls.map((tc) => TOOL_LABELS[tc.function.name] || tc.function.name);
            send("tool_calls", {
              step: loop + 1,
              tools: serverCalls.map((tc) => tc.function.name),
              message: toolCallLabels.join(", ") + "...",
            });

            // Add assistant message to conversation
            apiMessages.push({
              role: "assistant",
              content: content || "",
              tool_calls: toolCalls,
            });

            // Execute ALL server tools in parallel
            const serverResults = await Promise.all(
              serverCalls.map(async (tc) => {
                const result = await executeServerTool(tc.function.name, tc.function.arguments);
                return { tool_call_id: tc.id, name: tc.function.name, content: result };
              })
            );

            // Stream each tool result
            for (const res of serverResults) {
              const label = TOOL_LABELS[res.name] || res.name;
              send("tool_result", {
                step: loop + 1,
                tool: res.name,
                message: `✓ ${label}`,
              });
              apiMessages.push({ role: "tool", tool_call_id: res.tool_call_id, content: res.content });
            }

            // Provide deferred results for client tools
            for (const tc of clientCalls) {
              apiMessages.push({
                role: "tool",
                tool_call_id: tc.id,
                content: "Tool execution deferred to client. Continue with your response.",
              });
            }

            console.log(`Agentic loop ${loop + 1}: ${serverCalls.length} server tools, ${clientCalls.length} client tools deferred`);
          }

          // Max loops reached
          send("done", {
            message: { role: "assistant", content: "I encountered an issue processing your request. Please try again." },
          });
          controller.close();
        } catch (e) {
          console.error("SSE stream error:", e);
          const send = (type: string, data: any) => {
            try { controller.enqueue(new TextEncoder().encode(sseEvent(type, data))); } catch {}
          };
          send("error", { error: e instanceof Error ? e.message : "Unknown error" });
          try { controller.close(); } catch {}
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
