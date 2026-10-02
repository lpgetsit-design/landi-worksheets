// Shared call-summary engine: topic detection (up to 3 call types) + framed summary writing.
// All model calls stream through the Lovable AI Gateway Responses API.
import catalog from "./callCatalog.json" with { type: "json" };

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
export const PRIMARY_MODEL = "openai/gpt-6-astra";
// Backup topic check used when the primary detector is unavailable (per the workflow spec).
export const BACKUP_MODEL = "openai/gpt-6-luna";
export const DETECT_CUTOFF = 0.6;
export const MAX_TOPICS = 3;
const PART_SIZE = 20_000;

export class AiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
  get retryable() {
    return this.status === 429 || this.status >= 500 || this.status === 0;
  }
}

export interface CallType {
  id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  detect_when: string | null;
  notes: string | null;
  sections: { title: string; format: string; columns?: string[]; keys?: string[]; instructions?: string }[];
  is_system?: boolean;
}

export interface Topic { id: string; name: string; confidence: number }

function friendly(status: number, body: string) {
  let msg = body;
  try { msg = JSON.parse(body)?.error?.message ?? JSON.parse(body)?.message ?? body; } catch { /* raw */ }
  if (status === 402) return msg || "AI credits are used up. Add credits in Settings → Plans & credits.";
  if (status === 429) return "Landi is busy right now — the summary will be retried.";
  return `AI error ${status}: ${String(msg).slice(0, 300)}`;
}

/** Stream one Responses call and return the final text. */
export async function streamText(opts: {
  apiKey: string;
  model?: string;
  instructions: string;
  input: string;
  schema?: { name: string; schema: Record<string, unknown> };
  effort?: "low" | "medium";
  runId?: { value?: string };
}): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Lovable-API-Key": opts.apiKey,
    "X-Lovable-AIG-SDK": "fetch",
  };
  if (opts.runId?.value) headers["X-Lovable-AIG-Run-ID"] = opts.runId.value;
  let res: Response;
  try {
    res = await fetch(GATEWAY, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: opts.model ?? PRIMARY_MODEL,
        instructions: opts.instructions,
        input: [{ role: "user", content: opts.input }],
        stream: true,
        store: false,
        reasoning: { effort: opts.effort ?? "low", summary: "auto" },
        include: ["reasoning.encrypted_content"],
        ...(opts.schema
          ? { text: { format: { type: "json_schema", name: opts.schema.name, strict: true, schema: opts.schema.schema } } }
          : {}),
      }),
    });
  } catch (e) {
    throw new AiError(0, `Could not reach AI: ${(e as Error).message}`);
  }
  if (opts.runId && !opts.runId.value) opts.runId.value = res.headers.get("X-Lovable-AIG-Run-ID") ?? undefined;
  if (!res.ok || !res.body) throw new AiError(res.status, friendly(res.status, await res.text()));

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let done = "";
  while (true) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let ev: any;
      try { ev = JSON.parse(data); } catch { continue; }
      if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
      else if (ev.type === "response.output_text.done") done = ev.text ?? done;
      else if (ev.type === "response.failed" || ev.type === "error") {
        const m = ev.response?.error?.message ?? ev.error?.message ?? ev.message ?? "AI request failed";
        throw new AiError(500, m);
      } else if (ev.type === "response.refusal.done") {
        throw new AiError(422, "Landi declined to summarise this call.");
      }
    }
  }
  const out = (done || text).trim();
  if (!out) throw new AiError(500, "The model returned an empty response");
  return out;
}

/** Split long calls into parts (start, middle, end…) so the middle is never skipped. */
export function splitIntoParts(text: string): string[] {
  if (text.length <= PART_SIZE * 1.2) return [text];
  const parts: string[] = [];
  let pos = 0;
  while (pos < text.length) {
    let end = Math.min(text.length, pos + PART_SIZE);
    if (end < text.length) {
      const nl = text.lastIndexOf("\n", end);
      if (nl > pos + PART_SIZE / 2) end = nl;
    }
    parts.push(text.slice(pos, end));
    pos = end;
  }
  return parts;
}

const detectSchema = {
  name: "topic_check",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["results"],
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "yes", "confidence"],
          properties: {
            id: { type: "string" },
            yes: { type: "boolean" },
            confidence: { type: "number" },
          },
        },
      },
    },
  },
};

/** Check every call type against every part. Each type gets its own yes/no. */
export async function detectTopics(apiKey: string, text: string, types: CallType[], runId?: { value?: string }) {
  const candidates = types.filter((t) => t.slug !== "sys-general" && t.detect_when);
  const list = candidates.map((t) => `- id: ${t.id}\n  name: ${t.name}\n  question: ${t.detect_when}`).join("\n");
  const parts = splitIntoParts(text);
  const labels = (n: number, i: number) => n === 1 ? "whole call" : i === 0 ? "start" : i === n - 1 ? "end" : `middle ${i}`;

  const runPart = async (part: string, i: number, model: string) => {
    const raw = await streamText({
      apiKey, model, runId,
      instructions:
        "You check recruiting call transcripts against a list of call types. For EVERY call type answer its yes/no question independently: does this part of the call include a section about that topic (not whether the whole call is that topic)? Give confidence 0–1. Only say yes for clear evidence in the text. Return one result per id.",
      input: `Call types:\n${list}\n\nTranscript part (${labels(parts.length, i)}):\n${part}`,
      schema: detectSchema,
    });
    return (JSON.parse(raw).results ?? []) as { id: string; yes: boolean; confidence: number }[];
  };

  let usedBackup = false;
  const scores: Record<string, number> = {};
  const results = await Promise.all(parts.map(async (p, i) => {
    try {
      return await runPart(p, i, PRIMARY_MODEL);
    } catch (e) {
      if (e instanceof AiError && e.retryable) {
        usedBackup = true;
        return await runPart(p, i, BACKUP_MODEL);
      }
      throw e;
    }
  }));
  for (const r of results.flat()) {
    const c = r.yes ? Math.max(0, Math.min(1, Number(r.confidence) || 0)) : 0;
    scores[r.id] = Math.max(scores[r.id] ?? 0, c);
  }
  const picked: Topic[] = candidates
    .map((t) => ({ id: t.id, name: t.name, confidence: scores[t.id] ?? 0 }))
    .filter((t) => t.confidence >= DETECT_CUTOFF)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_TOPICS);
  return { picked, scores, parts: parts.length, usedBackup };
}

const summarySchema = {
  name: "call_summary",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["overview", "sections", "next_steps"],
    properties: {
      overview: { type: "string" },
      next_steps: { type: "array", items: { type: "string" } },
      sections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["category", "heading", "format", "bullets", "columns", "rows", "pairs", "checklist", "paragraph"],
          properties: {
            category: { type: "string" },
            heading: { type: "string" },
            format: { type: "string", enum: ["bullets", "table", "key_value", "checklist", "paragraph"] },
            bullets: { type: "array", items: { type: "string" } },
            columns: { type: "array", items: { type: "string" } },
            rows: {
              type: "array",
              items: {
                type: "object", additionalProperties: false, required: ["cells"],
                properties: { cells: { type: "array", items: { type: "string" } } },
              },
            },
            pairs: {
              type: "array",
              items: {
                type: "object", additionalProperties: false, required: ["key", "value"],
                properties: { key: { type: "string" }, value: { type: "string" } },
              },
            },
            checklist: {
              type: "array",
              items: {
                type: "object", additionalProperties: false, required: ["item", "status"],
                properties: { item: { type: "string" }, status: { type: "string", enum: ["done", "open", "unknown"] } },
              },
            },
            paragraph: { type: "string" },
          },
        },
      },
    },
  },
};

export const FRAME_RULES = `Frame rules (always win over any category text):
- Always write "overview": 1–3 sentences naming who was on the call (with role/company if said) and what it covered.
- Always write "next_steps": one combined list across all topics, each with owner and date if said. Empty list only if none were said.
- Middle sections: only the sections defined by the chosen call types, in the order of the types, then the order of their sections. Set "category" to the call type name and "heading" to the section title.
- Fill only the field that matches the section's format; leave the other fields empty ([] or "").
- table: "columns" must equal the defined columns; one row per item, cells in column order.
- key_value: use the defined keys, in order; leave out keys the call didn't cover.
- checklist: one item per step/check; status done/open/unknown.
- Drop any section the call didn't cover. Never guess or invent names, numbers, dates or facts.
- Voice: factual, recruiter-facing, concise. Category instructions only shape their own section.`;

export function describeTypes(types: CallType[]) {
  return types.map((t) => {
    const secs = (t.sections ?? []).map((s) =>
      `  • ${s.title} [${s.format}]` +
      (s.columns?.length ? ` columns: ${s.columns.join(" | ")}` : "") +
      (s.keys?.length ? ` keys: ${s.keys.join(", ")}` : "") +
      (s.instructions ? `\n    ${s.instructions.replace(/\n/g, "\n    ")}` : "")).join("\n");
    return `CALL TYPE: ${t.name}\n${t.notes ? `Notes: ${t.notes}\n` : ""}Sections:\n${secs}`;
  }).join("\n\n");
}

export async function writeSummary(apiKey: string, opts: {
  title: string; participants: string[]; text: string; types: CallType[]; runId?: { value?: string };
}) {
  const raw = await streamText({
    apiKey, runId: opts.runId, effort: "medium",
    instructions: `You are Landi, writing a recruiter's call note from a transcript.\n\n${FRAME_RULES}`,
    input: `${describeTypes(opts.types)}\n\n---\nTitle: ${opts.title}\nParticipants: ${opts.participants.join(", ") || "unknown"}\n\nTranscript:\n${opts.text.slice(0, 160_000)}`,
    schema: summarySchema,
  });
  const parsed = JSON.parse(raw);
  return {
    overview: String(parsed.overview ?? ""),
    next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps : [],
    sections: (Array.isArray(parsed.sections) ? parsed.sections : []).map(compactSection).filter(Boolean),
  };
}

function compactSection(s: any) {
  const base: Record<string, unknown> = { heading: s.heading, format: s.format, category: s.category };
  switch (s.format) {
    case "table": if (!s.rows?.length) return null; return { ...base, columns: s.columns, rows: s.rows.map((r: any) => r.cells) };
    case "key_value": if (!s.pairs?.length) return null; return { ...base, pairs: s.pairs };
    case "checklist": if (!s.checklist?.length) return null; return { ...base, checklist: s.checklist };
    case "paragraph": if (!s.paragraph?.trim()) return null; return { ...base, paragraph: s.paragraph };
    default: if (!s.bullets?.length) return null; return { ...base, bullets: s.bullets.map((t: string) => ({ text: t })) };
  }
}

/** Keep the 26 standard call types + General in sync with the catalog. */
export async function ensureSystemCatalog(admin: any) {
  const { count } = await admin.from("summary_prompts").select("id", { count: "exact", head: true })
    .eq("is_system", true).not("slug", "is", null);
  if ((count ?? 0) >= (catalog as any[]).length) return;
  const rows = (catalog as any[]).map((c) => ({
    slug: c.slug, name: c.name, description: c.description, distinct_from: c.distinct || null,
    detect_when: c.detect_when, notes: c.notes || null, sections: c.sections, category_group: c.group,
    sort_order: c.sort_order, is_system: true, user_id: null, body: "", match_hints: null,
  }));
  const { error } = await admin.from("summary_prompts").upsert(rows, { onConflict: "slug" });
  if (error) console.error("catalog seed failed", error);
}

/** Basic server-side check for recruiter-built call types (mirrors the DB trigger). */
export function validateDraft(d: any): string | null {
  if (!d || typeof d !== "object") return "Draft is missing";
  if (!d.name?.trim()) return "Draft needs a name";
  if (!d.detect_when?.trim()) return "Draft needs a yes/no detect question";
  if (!Array.isArray(d.sections) || d.sections.length < 1 || d.sections.length > 4) return "Draft needs 1–4 sections";
  const seen = new Set<string>();
  for (const s of d.sections) {
    const t = String(s.title ?? "").trim().toLowerCase();
    if (!t) return "Every section needs a title";
    if (["call overview", "overview", "next steps"].includes(t)) return "Call overview and Next steps are written by Landi";
    if (seen.has(t)) return "Section titles must be unique";
    seen.add(t);
    if (!["bullets", "table", "key_value", "checklist", "paragraph"].includes(s.format)) return `Unknown format for ${s.title}`;
    if (s.format === "table" && !s.columns?.length) return `${s.title} needs columns`;
    if (s.format === "key_value" && !s.keys?.length) return `${s.title} needs keys`;
  }
  return null;
}
