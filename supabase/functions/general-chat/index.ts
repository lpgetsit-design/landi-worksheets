import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RefWorksheet {
  worksheetId: string;
  title: string;
  documentType: string;
}

function sseEvent(type: string, data: any): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function fetchWorksheetContents(
  refs: RefWorksheet[],
  authHeader: string | null,
): Promise<Array<{ title: string; documentType: string; content: string }>> {
  if (refs.length === 0) return [];
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Use the user's JWT so RLS enforces access
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
  });

  const ids = refs.map((r) => r.worksheetId);
  const { data, error } = await supabase
    .from("worksheets")
    .select("id, title, document_type, content_md")
    .in("id", ids);

  if (error) {
    console.error("Failed to fetch worksheets:", error);
    return [];
  }

  const byId = new Map((data || []).map((w: any) => [w.id, w]));
  return refs
    .map((r) => {
      const w = byId.get(r.worksheetId);
      if (!w) return null;
      return {
        title: w.title || r.title,
        documentType: w.document_type || r.documentType,
        content: w.content_md || "(empty)",
      };
    })
    .filter(Boolean) as Array<{ title: string; documentType: string; content: string }>;
}

async function streamAIResponse(
  apiMessages: any[],
  apiKey: string,
  send: (type: string, data: any) => void,
): Promise<string> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: apiMessages,
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
  let firstSent = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") break;
      try {
        const parsed = JSON.parse(jsonStr);
        const delta = parsed.choices?.[0]?.delta;
        if (delta?.content) {
          if (!firstSent) {
            send("status", { phase: "responding", message: "Responding…" });
            firstSent = true;
          }
          content += delta.content;
          send("token", { content: delta.content });
        }
      } catch {
        buffer = line + "\n" + buffer;
        break;
      }
    }
  }

  return content;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, referencedWorksheets } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("authorization");
    const worksheetContents = await fetchWorksheetContents(
      (referencedWorksheets || []) as RefWorksheet[],
      authHeader,
    );

    const worksheetContext =
      worksheetContents.length > 0
        ? `\n\nThe user has attached the following worksheet(s) as context. Ground your answers in them when relevant and cite them by title.\n\n` +
          worksheetContents
            .map(
              (w, i) =>
                `--- Worksheet ${i + 1}: "${w.title}" (${w.documentType}) ---\n${w.content}\n--- End worksheet ${i + 1} ---`,
            )
            .join("\n\n")
        : "";

    const systemPrompt = `You are a helpful general-purpose AI assistant. Answer questions clearly and concisely using markdown formatting (headings, lists, code blocks, tables when useful).${worksheetContext}`;

    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    const stream = new ReadableStream({
      async start(controller) {
        const send = (type: string, data: any) => {
          try {
            controller.enqueue(new TextEncoder().encode(sseEvent(type, data)));
          } catch {
            // closed
          }
        };
        controller.enqueue(new TextEncoder().encode(`: connected\n\n`));

        // Keepalive
        const ping = setInterval(() => {
          try {
            controller.enqueue(new TextEncoder().encode(`: ping\n\n`));
          } catch {
            // closed
          }
        }, 3000);

        try {
          send("status", { phase: "thinking", message: "Thinking…" });
          const content = await streamAIResponse(apiMessages, LOVABLE_API_KEY, send);
          send("done", { message: { role: "assistant", content } });
        } catch (e: any) {
          if (e.message === "RATE_LIMIT") {
            send("error", { error: "Rate limit exceeded. Please try again in a moment." });
          } else if (e.message === "PAYMENT_REQUIRED") {
            send("error", {
              error: "AI credits exhausted. Please add funds in Settings → Workspace → Usage.",
            });
          } else {
            console.error("general-chat stream error:", e);
            send("error", { error: "AI gateway error" });
          }
        } finally {
          clearInterval(ping);
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    console.error("general-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});