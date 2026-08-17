const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function sseEvent(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, transcriptTitle, transcriptText, summarySections } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are Landi, helping a recruiter work with one conversation transcript.

Transcript title: ${transcriptTitle ?? "(untitled)"}

--- TRANSCRIPT ---
${(transcriptText ?? "").slice(0, 60000) || "(no transcript text)"}
--- END TRANSCRIPT ---

Current summary (JSON array of sections):
${JSON.stringify(summarySections ?? [], null, 2)}

Rules:
- Answer questions about the conversation grounded strictly in the transcript. Be concise, use markdown.
- If the recruiter asks you to edit, rewrite, enhance, extend or restructure the summary, reply with a one-line confirmation of what you changed AND append the full updated summary as a fenced block exactly like:

\`\`\`summary
[{"heading":"Section title","bullets":[{"text":"Point","children":["Sub point"]}]}]
\`\`\`

- The block must contain the COMPLETE new summary (all sections), valid JSON, matching that shape. Only include the block when the summary should change.`;

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, ...(messages ?? [])],
        stream: true,
      }),
    });

    if (!upstream.ok) {
      const status = upstream.status;
      const detail = await upstream.text();
      console.error("AI gateway error:", status, detail);
      const message =
        status === 429
          ? "Rate limit exceeded. Please try again in a moment."
          : status === 402
          ? "AI credits exhausted. Please add funds to the workspace."
          : "AI gateway error";
      return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const send = (type: string, data: unknown) => {
          try { controller.enqueue(enc.encode(sseEvent(type, data))); } catch { /* closed */ }
        };
        const reader = upstream.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let content = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let nl: number;
            while ((nl = buffer.indexOf("\n")) !== -1) {
              let line = buffer.slice(0, nl);
              buffer = buffer.slice(nl + 1);
              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice(6).trim();
              if (jsonStr === "[DONE]") continue;
              try {
                const delta = JSON.parse(jsonStr).choices?.[0]?.delta;
                if (delta?.content) {
                  content += delta.content;
                  send("token", { content: delta.content });
                }
              } catch {
                buffer = line + "\n" + buffer;
                break;
              }
            }
          }
          send("done", { content });
        } catch (e) {
          console.error("transcript-chat stream error:", e);
          send("error", { error: "AI gateway error" });
        } finally {
          try { controller.close(); } catch { /* closed */ }
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
    console.error("transcript-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
