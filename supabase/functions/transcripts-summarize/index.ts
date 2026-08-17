import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/transcripts.ts";

/**
 * Classifies a transcript against the recruiter's prompt library (system prompts +
 * their own private prompts) and immediately summarises it with the chosen prompt.
 * One prompt per transcript, chosen only by the classifier — no manual override.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { transcript_id } = await req.json();
    if (!transcript_id) return json({ error: "transcript_id is required" }, 400);

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured" }, 500);

    // RLS keeps this owner-only.
    const { data: t, error: tErr } = await supabase
      .from("transcripts")
      .select("*")
      .eq("id", transcript_id)
      .maybeSingle();
    if (tErr) return json({ error: tErr.message }, 400);
    if (!t) return json({ error: "Transcript not found" }, 404);
    if (t.status !== "ready") return json({ status: "waiting" });

    const body = (t.content_text ?? "").trim() ||
      (Array.isArray(t.segments) ? t.segments.map((s: any) => `${s.speaker}: ${s.text}`).join("\n") : "");
    if (!body) return json({ status: "waiting" });

    const { data: prompts } = await supabase
      .from("summary_prompts")
      .select("id, name, description, match_hints, body, is_system")
      .order("is_system", { ascending: false });
    if (!prompts?.length) return json({ error: "No prompts available" }, 400);

    await supabase.from("transcripts").update({ summary_status: "running", summary_error: null }).eq("id", t.id);

    const call = async (messages: unknown[], tool?: unknown) => {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          ...(tool ? { tools: [{ type: "function", function: tool }], tool_choice: { type: "function", function: { name: (tool as any).name } } } : {}),
        }),
      });
      if (!res.ok) throw new Error(`AI error ${res.status}: ${await res.text()}`);
      return await res.json();
    };

    // 1. Classify — pick exactly one prompt from the library.
    const catalogue = prompts.map((p: any) =>
      `- ${p.name}: ${p.description ?? ""} (clues: ${p.match_hints ?? "none"})`).join("\n");
    const clues = [
      `Title/subject: ${t.title}`,
      `Source: ${t.source}`,
      `Participants: ${(t.participants ?? []).join(", ") || "unknown"}`,
      `Opening lines: ${body.slice(0, 1200)}`,
    ].join("\n");

    const classification = await call(
      [
        { role: "system", content: "You classify recruiting conversations. Pick exactly one prompt name from the catalogue that best fits the conversation. Use the fallback prompt only when nothing else fits." },
        { role: "user", content: `Catalogue:\n${catalogue}\n\nConversation clues:\n${clues}` },
      ],
      {
        name: "pick_prompt",
        description: "Choose the single best prompt for this conversation",
        parameters: {
          type: "object",
          properties: {
            prompt_name: { type: "string", enum: prompts.map((p: any) => p.name) },
            reason: { type: "string", description: "One short sentence explaining the choice" },
          },
          required: ["prompt_name", "reason"],
        },
      },
    );
    const pick = JSON.parse(classification.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}");
    const chosen = prompts.find((p: any) => p.name === pick.prompt_name) ??
      prompts.find((p: any) => p.name === "General Conversation") ?? prompts[0];

    // 2. Summarise with that prompt.
    const summaryRes = await call(
      [
        { role: "system", content: `${chosen.body}\n\nReturn the summary as sections with short factual bullets. Never invent facts that are not in the transcript.` },
        { role: "user", content: `Title: ${t.title}\nParticipants: ${(t.participants ?? []).join(", ")}\n\nTranscript:\n${body.slice(0, 30000)}` },
      ],
      {
        name: "write_summary",
        description: "Structured summary sections",
        parameters: {
          type: "object",
          properties: {
            sections: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  heading: { type: "string" },
                  bullets: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string" },
                        children: { type: "array", items: { type: "string" } },
                      },
                      required: ["text"],
                    },
                  },
                },
                required: ["heading", "bullets"],
              },
            },
          },
          required: ["sections"],
        },
      },
    );
    const parsed = JSON.parse(summaryRes.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}");
    const sections = Array.isArray(parsed.sections) ? parsed.sections : [];

    const { error: upErr } = await supabase
      .from("transcripts")
      .update({
        summary_prompt_id: chosen.id,
        summary_sections: sections,
        summary_status: sections.length ? "ready" : "failed",
        summary_error: sections.length ? null : "The model returned no summary",
        classified_reason: pick.reason ?? null,
        summarized_at: new Date().toISOString(),
      })
      .eq("id", t.id);
    if (upErr) return json({ error: upErr.message }, 400);

    return json({ status: "ready", prompt: chosen.name, sections });
  } catch (e) {
    const message = (e as Error).message;
    try {
      const { transcript_id } = await req.clone().json().catch(() => ({ transcript_id: null }));
      if (transcript_id) {
        const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await admin.from("transcripts").update({ summary_status: "failed", summary_error: message }).eq("id", transcript_id);
      }
    } catch { /* ignore */ }
    return json({ error: message }, 500);
  }
});
