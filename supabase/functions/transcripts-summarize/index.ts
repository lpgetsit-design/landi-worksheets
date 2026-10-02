import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/transcripts.ts";
import {
  AiError, MAX_TOPICS, detectTopics, ensureSystemCatalog, validateDraft, writeSummary,
  type CallType, type Topic,
} from "../_shared/callSummary.ts";

/**
 * Call summary workflow:
 * 1. Read the whole call (long calls split into start/middle/end parts).
 * 2. Check every call type (26 standard + the recruiter's own) with its own yes/no.
 * 3. Keep up to 3 clear topics, strongest first; none clear → General.
 * 4. Write overview + one section group per topic + combined next steps.
 * The previous summary is kept in history so the recruiter can undo.
 *
 * Body: { transcript_id, category_ids?: string[] (regenerate with chosen topics),
 *         preview_draft?: CallType-like, preview_with?: string (not saved) }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let transcriptId: string | null = null;
  let supabase: any = null;
  let isPreview = false;
  try {
    const body = await req.json().catch(() => ({}));
    transcriptId = typeof body.transcript_id === "string" ? body.transcript_id : null;
    if (!transcriptId) return json({ error: "transcript_id is required" }, 400);
    const forced: string[] | null = Array.isArray(body.category_ids) ? body.category_ids.slice(0, MAX_TOPICS) : null;
    isPreview = !!body.preview_draft;

    supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured" }, 500);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await ensureSystemCatalog(admin);

    const { data: t, error: tErr } = await supabase.from("transcripts").select("*").eq("id", transcriptId).maybeSingle();
    if (tErr) return json({ error: tErr.message }, 400);
    if (!t) return json({ error: "Transcript not found" }, 404);
    if (t.status !== "ready") return json({ status: "waiting" });

    const text = (t.content_text ?? "").trim() ||
      (Array.isArray(t.segments) ? t.segments.map((s: any) => `${s.speaker}: ${s.text}`).join("\n") : "");
    if (!text) return json({ status: "waiting" });

    const { data: rows } = await supabase
      .from("summary_prompts")
      .select("id, slug, name, description, detect_when, notes, sections, is_system, body")
      .order("sort_order");
    const types: CallType[] = (rows ?? []).map((r: any) => ({
      ...r,
      // Legacy free-text prompts become a single section so they still work.
      sections: Array.isArray(r.sections) && r.sections.length
        ? r.sections
        : [{ title: r.name, format: "bullets", instructions: r.body ?? "" }],
      detect_when: r.detect_when ?? r.description,
    }));
    const general = types.find((x) => x.slug === "sys-general");
    if (!general) return json({ error: "Call types are not available yet" }, 500);
    const runId: { value?: string } = {};

    // ---- Preview a recruiter's draft call type (never saved) ----
    if (isPreview) {
      const problem = validateDraft(body.preview_draft);
      if (problem) return json({ error: problem }, 400);
      const draft: CallType = { id: "draft", name: body.preview_draft.name, detect_when: body.preview_draft.detect_when,
        notes: body.preview_draft.notes ?? null, sections: body.preview_draft.sections };
      const partner = types.find((x) => x.id === body.preview_with && x.slug !== "sys-general");
      const summary = await writeSummary(apiKey, {
        title: t.title, participants: t.participants ?? [], text, types: partner ? [draft, partner] : [draft], runId,
      });
      return json({ status: "preview", summary });
    }

    await supabase.from("transcripts")
      .update({ summary_status: "running", summary_error: null, summary_started_at: new Date().toISOString() })
      .eq("id", t.id);

    let picked: Topic[];
    let detection: Record<string, unknown> | null = null;
    if (forced) {
      picked = forced.map((id) => types.find((x) => x.id === id)).filter(Boolean)
        .map((x) => ({ id: x!.id, name: x!.name, confidence: 1 }));
      // General is never combined with other types.
      if (picked.some((p) => p.id === general.id) && picked.length > 1) picked = picked.filter((p) => p.id !== general.id);
    } else {
      const d = await detectTopics(apiKey, text, types, runId);
      picked = d.picked;
      detection = { scores: d.scores, parts: d.parts, backup: d.usedBackup, at: new Date().toISOString() };
    }
    if (picked.length === 0) picked = [{ id: general.id, name: general.name, confidence: 0 }];

    const chosenTypes = picked.map((p) => types.find((x) => x.id === p.id)!).filter(Boolean);
    const summary = await writeSummary(apiKey, { title: t.title, participants: t.participants ?? [], text, types: chosenTypes, runId });

    // Keep the previous summary so the recruiter can undo.
    const history = Array.isArray(t.summary_history) ? t.summary_history : [];
    const hadSummary = (t.summary_sections?.length ?? 0) > 0 || t.summary_overview;
    const nextHistory = hadSummary
      ? [{
          overview: t.summary_overview, sections: t.summary_sections, next_steps: t.summary_next_steps,
          categories: t.summary_categories, saved_at: new Date().toISOString(), reason: forced ? "regenerate" : "auto",
        }, ...history].slice(0, 10)
      : history;

    const ok = summary.sections.length > 0 || summary.overview.length > 0;
    const { error: upErr } = await supabase.from("transcripts").update({
      summary_prompt_id: picked[0].id,
      summary_categories: picked,
      summary_detection: detection ?? t.summary_detection,
      summary_overview: summary.overview,
      summary_sections: summary.sections,
      summary_next_steps: summary.next_steps,
      summary_history: nextHistory,
      summary_status: ok ? "ready" : "failed",
      summary_error: ok ? null : "The model returned no summary",
      classified_reason: picked.map((p) => `${p.name} (${Math.round(p.confidence * 100)}%)`).join(", "),
      summarized_at: new Date().toISOString(),
    }).eq("id", t.id);
    if (upErr) return json({ error: upErr.message }, 400);

    return json({ status: "ready", topics: picked, ...summary });
  } catch (e) {
    const status = e instanceof AiError ? e.status : 500;
    const message = (e as Error).message;
    console.error("transcripts-summarize", status, message);
    if (transcriptId && supabase && !isPreview) {
      // Rate limits / outages go back to the queue; everything else is shown on the transcript.
      const retry = e instanceof AiError && e.retryable;
      await supabase.from("transcripts").update(
        retry ? { summary_status: "pending", summary_error: message } : { summary_status: "failed", summary_error: message },
      ).eq("id", transcriptId);
    }
    return json({ error: message }, status >= 400 && status < 600 ? status : 500);
  }
});
