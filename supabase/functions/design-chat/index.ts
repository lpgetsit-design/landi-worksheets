const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOOLS = [
  {
    type: "function",
    function: {
      name: "replace_design_html",
      description:
        "Replace the entire design worksheet with a new complete HTML page. Always output a full standalone HTML document with <!DOCTYPE html>, <html>, <head>, and <body>. Include all CSS inline or in <style> tags. Include all JavaScript inline or in <script> tags. You may use CDN links for external libraries like Tailwind CSS, Chart.js, Three.js, GSAP, etc.",
      parameters: {
        type: "object",
        properties: {
          html: {
            type: "string",
            description: "The complete HTML document source code",
          },
        },
        required: ["html"],
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
];

const TOOL_LABELS: Record<string, string> = {
  replace_design_html: "Building webpage",
  update_worksheet_title: "Changing title",
};

const MAX_LOOPS = 5;

function sseEvent(type: string, data: any): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

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
      model: "google/gemini-2.5-flash",
      messages: apiMessages,
      tools: TOOLS,
      stream: true,
    }),
  });

  if (!response.ok) {
    const status = response.status;
    const t = await response.text();
    console.error("AI gateway error:", status, t);
    if (status === 429) throw new Error("RATE_LIMIT");
    if (status === 402) throw new Error("PAYMENT_REQUIRED");
    throw new Error("AI_GATEWAY_ERROR");
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const toolCallDeltas: Record<number, { id: string; type: string; function: { name: string; arguments: string } }> = {};
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

        if (delta.content) {
          if (!firstContentSent) {
            send("status", { phase: "responding", message: "AI is responding..." });
            firstContentSent = true;
          }
          content += delta.content;
          send("token", { content: delta.content });
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!toolCallDeltas[idx]) {
              toolCallDeltas[idx] = { id: tc.id || "", type: "function", function: { name: "", arguments: "" } };
            }
            if (tc.id) toolCallDeltas[idx].id = tc.id;
            if (tc.function?.name) toolCallDeltas[idx].function.name += tc.function.name;
            if (tc.function?.arguments) toolCallDeltas[idx].function.arguments += tc.function.arguments;
          }
        }
      } catch {
        buffer = line + "\n" + buffer;
        break;
      }
    }
  }

  const toolCalls = Object.values(toolCallDeltas);
  return { content, toolCalls };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, worksheetTitle, currentHtml } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are an expert web designer and developer AI. You build complete, interactive, standalone HTML webpages inside a design worksheet.

Current worksheet:
- Title: "${worksheetTitle || "Untitled"}"
- Current HTML content:
\`\`\`html
${currentHtml || "<!-- empty - no page built yet -->"}
\`\`\`

YOUR ROLE:
- You are a webpage builder. When the user asks you to create, modify, or build something, use the replace_design_html tool to output a COMPLETE standalone HTML document.
- Always output a full <!DOCTYPE html> page with everything self-contained.
- You can use CDN links for libraries like Tailwind CSS, Chart.js, Three.js, Alpine.js, GSAP, D3.js, etc.
- Include all CSS in <style> tags or via CDN links.
- Include all JavaScript in <script> tags or via CDN links.
- Make pages visually polished and modern by default. Use good typography, spacing, and colors.
- When modifying an existing page, preserve what the user didn't ask to change.
- Keep designs responsive and mobile-friendly.
- For interactivity, use vanilla JavaScript or lightweight libraries.
- After building/modifying, briefly describe what you built or changed.

IMPORTANT:
- Every call to replace_design_html must contain the COMPLETE HTML document, not a partial snippet.
- If the user asks a question (not a build request), respond conversationally without calling tools.
- You may also change the title if appropriate using update_worksheet_title.`;

    let apiMessages: any[] = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    const stream = new ReadableStream({
      async start(controller) {
        const send = (type: string, data: any) => {
          controller.enqueue(new TextEncoder().encode(sseEvent(type, data)));
        };
        controller.enqueue(new TextEncoder().encode(`: connected\n\n`));

        try {
          for (let loop = 0; loop < MAX_LOOPS; loop++) {
            send("status", {
              step: loop + 1,
              phase: "thinking",
              message: loop === 0 ? "Designing your page..." : "Refining...",
            });

            let keepAlive = true;
            const pingInterval = setInterval(() => {
              if (keepAlive) {
                try { controller.enqueue(new TextEncoder().encode(`: ping\n\n`)); } catch {}
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

            // All tools are client-side for design-chat
            if (toolCalls.length > 0) {
              const toolCallLabels = toolCalls.map((tc) => TOOL_LABELS[tc.function.name] || tc.function.name);
              send("tool_calls", {
                step: loop + 1,
                tools: toolCalls.map((tc) => tc.function.name),
                message: toolCallLabels.join(", ") + "...",
              });
            }

            const finalMessage: any = { role: "assistant", content: content || "" };
            if (toolCalls.length > 0) finalMessage.tool_calls = toolCalls;
            send("done", { message: finalMessage });
            controller.close();
            return;
          }

          send("done", {
            message: { role: "assistant", content: "I encountered an issue. Please try again." },
          });
          controller.close();
        } catch (e) {
          console.error("SSE stream error:", e);
          try {
            controller.enqueue(new TextEncoder().encode(sseEvent("error", { error: e instanceof Error ? e.message : "Unknown error" })));
            controller.close();
          } catch {}
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
    console.error("design-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
