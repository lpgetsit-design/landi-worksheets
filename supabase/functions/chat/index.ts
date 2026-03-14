import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const tools = [
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
- Always preserve content the user didn't ask you to change.`;

    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

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
          tools,
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

    return new Response(JSON.stringify(choice), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
