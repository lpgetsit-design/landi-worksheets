import { corsHeaders } from "../_shared/transcripts.ts";
import { requireUser, streamChat } from "../_shared/chatStream.ts";
import { FRAME_RULES } from "../_shared/callSummary.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) {
      return new Response(JSON.stringify({ error: "Please sign in again" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { messages, transcriptTitle, transcriptText, summary, topics } = await req.json();

    const instructions = `You are Landi, helping a recruiter work with one call transcript and its summary.

Transcript title: ${transcriptTitle ?? "(untitled)"}
Call types used for this summary: ${(topics ?? []).join(", ") || "unknown"}

--- TRANSCRIPT ---
${String(transcriptText ?? "").slice(0, 80000) || "(no transcript text)"}
--- END TRANSCRIPT ---

Current summary (JSON):
${JSON.stringify(summary ?? {}, null, 1)}

Rules:
- Answer questions grounded strictly in the transcript. Be concise, use markdown. Never invent facts.
- If the recruiter asks to edit, rewrite, shorten, extend or restructure the summary, reply with one line saying what you changed AND append the COMPLETE updated summary as a fenced block:

\`\`\`summary
{"overview":"...","sections":[{"category":"Job Intake","heading":"Role requirements","format":"table","columns":["A","B"],"rows":[["x","y"]]},{"heading":"...","format":"bullets","bullets":[{"text":"..."}]},{"heading":"...","format":"key_value","pairs":[{"key":"...","value":"..."}]},{"heading":"...","format":"checklist","checklist":[{"item":"...","status":"done|open|unknown"}]},{"heading":"...","format":"paragraph","paragraph":"..."}],"next_steps":["..."]}
\`\`\`

- Keep the frame: overview first, next steps last. Keep each section's format unless asked to change it.
- Valid JSON only inside the block. Only include the block when the summary should change. The previous version is kept so the recruiter can undo.

${FRAME_RULES}`;

    return await streamChat(req, instructions, messages ?? []);
  } catch (e) {
    console.error("transcript-chat error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
