import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./transcripts.ts";
import { PRIMARY_MODEL } from "./callSummary.ts";

export async function requireUser(req: Request) {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

const errJson = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Stream a chat reply from the Responses API as `data: {"content": "..."}` SSE lines. */
export async function streamChat(req: Request, instructions: string, messages: { role: string; content: string }[]) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return errJson(500, "AI is not configured");
  const input = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-30)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 20_000) }));

  let upstream: Response;
  try {
    upstream = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      signal: req.signal,
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: PRIMARY_MODEL, instructions, input, stream: true, store: false,
        reasoning: { effort: "low", summary: "auto" }, include: ["reasoning.encrypted_content"],
      }),
    });
  } catch (e) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    return errJson(502, `Could not reach AI: ${(e as Error).message}`);
  }
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text();
    console.error("AI error", upstream.status, detail);
    let msg = "AI request failed";
    try { msg = JSON.parse(detail)?.error?.message ?? JSON.parse(detail)?.message ?? msg; } catch { /* raw */ }
    if (upstream.status === 429) msg = "Landi is busy — please try again in a moment.";
    return errJson(upstream.status, msg);
  }

  const enc = new TextEncoder();
  const send = (c: ReadableStreamDefaultController, data: unknown) => c.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let got = false;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line.startsWith("data:")) continue;
            let ev: any;
            try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
            if (ev.type === "response.output_text.delta" && ev.delta) { got = true; send(controller, { content: ev.delta }); }
            else if (ev.type === "response.failed" || ev.type === "error") {
              send(controller, { error: ev.response?.error?.message ?? ev.error?.message ?? "AI request failed" });
            }
          }
        }
        if (!got) send(controller, { error: "Landi returned an empty reply." });
      } catch (e) {
        if (!req.signal.aborted) send(controller, { error: (e as Error).message });
      } finally {
        try { controller.close(); } catch { /* closed */ }
      }
    },
  });
  return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}
