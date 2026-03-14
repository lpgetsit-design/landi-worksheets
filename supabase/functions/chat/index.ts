import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
          content: {
            type: "string",
            description: "The full updated worksheet content in markdown format",
          },
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
      description:
        "Change the worksheet document type. Valid values: note, skill, prompt, template.",
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

const SERVER_TOOLS = [
  {
    type: "function",
    function: {
      name: "lookup_bullhorn_entity",
      description:
        "Search the Bullhorn CRM for an entity by name, ID, or partial match. Returns matching entities with their type, ID, and label. Use this tool whenever you see a Bullhorn entity ID (numeric) in text, when a user mentions a person/company/job by name, or when you need to resolve any CRM reference to create a proper badge.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "The search query — can be a name, numeric ID, or partial match string",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
];

const ALL_TOOLS = [...CLIENT_TOOLS, ...SERVER_TOOLS];
const SERVER_TOOL_NAMES = new Set(SERVER_TOOLS.map((t) => t.function.name));
const MAX_LOOPS = 5;

async function executeBullhornLookup(query: string): Promise<string> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/bullhorn-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ action: "entity_lookup", query }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return JSON.stringify({ error: `Bullhorn lookup failed: ${text}` });
    }

    const data = await resp.json();
    if (!data.results || data.results.length === 0) {
      return JSON.stringify({ results: [], message: `No entities found for "${query}"` });
    }

    return JSON.stringify(data);
  } catch (e) {
    return JSON.stringify({ error: `Bullhorn lookup error: ${e instanceof Error ? e.message : "Unknown"}` });
  }
}

async function executeServerTool(name: string, argsJson: string): Promise<string> {
  try {
    const args = JSON.parse(argsJson);
    switch (name) {
      case "lookup_bullhorn_entity":
        return await executeBullhornLookup(args.query);
      default:
        return JSON.stringify({ error: `Unknown server tool: ${name}` });
    }
  } catch (e) {
    return JSON.stringify({ error: `Tool execution error: ${e instanceof Error ? e.message : "Unknown"}` });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, worksheetTitle, worksheetContent, worksheetType } =
      await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are an expert AI assistant embedded in a worksheet editor app. You can both answer questions AND take actions to modify the user's worksheet using the tools available to you.

Current worksheet state:
- Title: "${worksheetTitle || "Untitled"}"
- Document type: ${worksheetType || "note"}
- Content:
${worksheetContent || "(empty)"}

GUIDELINES:
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

BULLHORN ENTITY LOOKUP:
- You have access to the lookup_bullhorn_entity tool to search the Bullhorn CRM.
- PROACTIVELY use this tool whenever you see bare numeric IDs in the worksheet content or user message that could be Bullhorn entity references (e.g. "candidate 249884", "contact ID 155594", "job order 12345").
- Also use it when the user mentions a person, company, or job by name and you need to find their CRM record.
- After a successful lookup, ALWAYS embed the entity using the [[CRM:entityType:entityId:label]] format in your content.
- If multiple results are returned, pick the most relevant one or ask the user to clarify.
- When replacing worksheet content, convert any bare entity IDs into proper [[CRM:...]] badges using lookup results.`;

    let apiMessages: any[] = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    // Agentic loop: execute server-side tools, return only when done or client tools needed
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
            model: "google/gemini-3-flash-preview",
            messages: apiMessages,
            tools: ALL_TOOLS,
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

      // If no server-side tools, return the response to the client
      if (serverCalls.length === 0) {
        // If there are client-side tool calls, return them; otherwise return plain message
        const finalMessage: any = { role: "assistant", content: msg.content || "" };
        if (clientCalls.length > 0) {
          finalMessage.tool_calls = clientCalls;
        }
        return new Response(JSON.stringify({ message: finalMessage }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Execute server-side tools and continue the loop
      // Add the assistant message with ALL tool calls to the conversation
      apiMessages.push({
        role: "assistant",
        content: msg.content || "",
        tool_calls: toolCalls,
      });

      // Execute server-side tools and add results
      for (const tc of serverCalls) {
        const result = await executeServerTool(tc.function.name, tc.function.arguments);
        apiMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }

      // For any client-side tool calls in this mixed response, we need to provide
      // placeholder results so the conversation can continue
      for (const tc of clientCalls) {
        apiMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: "Tool execution deferred to client. Continue with your response.",
        });
      }

      // Continue the loop — AI will process the tool results
      console.log(`Agentic loop ${loop + 1}: executed ${serverCalls.length} server tools, ${clientCalls.length} client tools deferred`);
    }

    // If we exhausted the loop, return whatever we have
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
