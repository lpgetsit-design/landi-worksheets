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
        "Resolve multiple Bullhorn entities by their type and ID in a single call. Use this when you have specific entity types and IDs (e.g. from existing badges, or numeric IDs mentioned in text). Much faster than calling lookup_bullhorn_entity multiple times. Returns each entity's label and basic data.",
      parameters: {
        type: "object",
        properties: {
          entities: {
            type: "array",
            description: "Array of entities to resolve, each with entityType and entityId",
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
        "Search Bullhorn CRM for candidates using a Lucene query. Use to find candidates by skills, location, experience, name, etc. Always include 'isDeleted:0' in queries. Combine conditions with AND. Examples: 'skillSet:Java AND address.state:\"New York\" AND isDeleted:0', 'firstName:John AND isDeleted:0'.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Lucene search query. Always include isDeleted:0." },
          count: { type: "number", description: "Max results to return (default 10, max 50)" },
          fields: { type: "string", description: "Comma-separated fields to return. Optional — uses sensible defaults." },
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
        "Get a detailed candidate profile from Bullhorn by numeric candidate ID. Returns contact info, skills, status, experience, and more.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Numeric Bullhorn Candidate ID" },
          fields: { type: "string", description: "Comma-separated fields. Optional — uses sensible defaults." },
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
        "Search Bullhorn CRM for job orders using a Lucene query. Use to find jobs by title, status, location, client. Always include 'isDeleted:false'. Examples: 'title:Engineer* AND isDeleted:false', 'status:\"Accepting Candidates\" AND isDeleted:false'.",
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
        "Search Bullhorn CRM for placements using a Lucene query. Examples: 'status:Approved', 'candidate.id:12345'.",
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
- ALWAYS use batch_resolve_entities when you need to resolve multiple entities at once. This is MUCH faster than calling individual lookup tools.
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
- IMPORTANT: Call as many tools as possible in PARALLEL in a single response. For example, if you need 3 candidate profiles, call all 3 get_bullhorn_candidate_profile tools at once, don't call them one at a time.
- If a search returns zero results, try broadening the query or ask the user to refine.
- Present results in a clear, formatted summary with bullet points or tables.
- Use [[CRM:entityType:entityId:label]] badges for all entity references in your responses.
- These CRM tools are for INFORMATION RETRIEVAL — keep them separate from worksheet editing tools.
- Only use worksheet tools when the user explicitly asks to modify the worksheet content.`;

    let apiMessages: any[] = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    for (let loop = 0; loop < MAX_LOOPS; loop++) {
      const response = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-5-mini",
            messages: apiMessages,
            tools: ALL_TOOLS,
            parallel_tool_calls: true,
            stream: false,
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings → Workspace → Usage." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const t = await response.text();
        console.error("AI gateway error:", response.status, t);
        return new Response(
          JSON.stringify({ error: "AI gateway error" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      const msg = choice?.message;

      if (!msg) {
        return new Response(
          JSON.stringify({ error: "No response from AI" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const toolCalls = msg.tool_calls || [];
      const serverCalls = toolCalls.filter((tc: any) => SERVER_TOOL_NAMES.has(tc.function.name));
      const clientCalls = toolCalls.filter((tc: any) => !SERVER_TOOL_NAMES.has(tc.function.name));

      if (serverCalls.length === 0) {
        const finalMessage: any = { role: "assistant", content: msg.content || "" };
        if (clientCalls.length > 0) finalMessage.tool_calls = clientCalls;
        return new Response(JSON.stringify({ message: finalMessage }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      apiMessages.push({
        role: "assistant",
        content: msg.content || "",
        tool_calls: toolCalls,
      });

      // Execute ALL server tools in parallel
      const serverResults = await Promise.all(
        serverCalls.map(async (tc: any) => ({
          tool_call_id: tc.id,
          content: await executeServerTool(tc.function.name, tc.function.arguments),
        }))
      );

      for (const result of serverResults) {
        apiMessages.push({ role: "tool", tool_call_id: result.tool_call_id, content: result.content });
      }

      for (const tc of clientCalls) {
        apiMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: "Tool execution deferred to client. Continue with your response.",
        });
      }

      console.log(`Agentic loop ${loop + 1}: ${serverCalls.length} server tools (parallel), ${clientCalls.length} client tools deferred`);
    }

    return new Response(
      JSON.stringify({ message: { role: "assistant", content: "I encountered an issue processing your request. Please try again." } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
