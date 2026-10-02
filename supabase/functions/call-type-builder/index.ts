import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/transcripts.ts";
import { streamChat } from "../_shared/chatStream.ts";

/** Chat assistant that turns a recruiter's plain-words description into a call type draft. */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const bad = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return bad(401, "Please sign in again");

    const { messages } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) return bad(400, "messages are required");

    const { data: existing } = await supabase.from("summary_prompts").select("name, detect_when, is_system").order("sort_order");
    const catalogue = (existing ?? []).map((p: any) => `- ${p.name}${p.is_system ? "" : " (yours)"}: ${p.detect_when ?? ""}`).join("\n");

    const instructions = `You help a recruiter create their own call type for Landi's call summaries. A call type works like the standard ones: Landi checks every call against each type's yes/no question, keeps up to 3 matches, and writes that type's sections between Landi's fixed "Call overview" (top) and "Next steps" (bottom).

Existing call types (avoid overlapping with them; you can only create the recruiter's own type, never change these):
${catalogue}

How to work:
1. If the request is vague, ask 1–3 short follow-up questions (what kind of call, what they want captured, preferred layout). Keep it friendly and plain — no jargon.
2. When you have enough, briefly explain the draft in plain words and append it as a fenced block:

\`\`\`calltype
{"name":"...","description":"One line on what it is for","detect_when":"Does part of this call ...?","notes":"Short guidance for the whole type (optional, under 500 chars)","sections":[{"title":"...","format":"bullets|table|key_value|checklist|paragraph","columns":["only for table"],"keys":["only for key_value or checklist"],"instructions":"- what to include, order, tone (under 1000 chars)"}]}
\`\`\`

Rules for the draft:
- detect_when is ONE yes/no question asking whether the call INCLUDES a part about this topic.
- 1–4 sections, unique titles. Never a section called Call overview, Overview or Next steps.
- Instructions only shape their own section; they must not mention other call types, change the frame, or allow guessing.
- Keep the whole type under about 3,000 characters. Use [] for unused columns/keys.
- When the recruiter asks for changes, send a full updated block.`;

    return await streamChat(req, instructions, messages);
  } catch (e) {
    console.error("call-type-builder", e);
    return bad(500, (e as Error).message);
  }
});
