import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { worksheetId, title, content, documentType } = await req.json();
    if (!worksheetId || !content) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a keyword extraction engine for a recruiting business document management system.
Extract 5-30 normalized, lowercase keywords from the document. Return ONLY a JSON array of strings.

Categories to cover:
- People: candidate names, client/company names, hiring managers
- Roles & Titles: job titles, positions, departments
- Skills & Qualifications: technical skills, certifications, degrees, languages
- Domain Tags: front-office (sourcing, placement, business development), middle-office (interview scheduling, resume formatting, compliance), back-office (accounting, HR, finance, marketing, payroll)
- Actions & Status: interview scheduled, offer extended, invoice sent, onboarding, screening
- Identifiers: CRM IDs, job requisition numbers, campaign names, report names, PO numbers
- Industry & Sector: healthcare, IT, engineering, finance, staffing, etc.
- Document Purpose: meeting notes, job description, client brief, invoice, SOW, campaign plan, candidate profile

Normalization rules:
- All lowercase
- Use singular forms (e.g. "candidate" not "candidates")
- Standardize synonyms (e.g. "resume" not "CV", "job order" not "job req")
- Remove articles and filler words
- Keep proper nouns (names, companies) but lowercase them
- Combine multi-word terms with spaces (e.g. "software engineer", "accounts payable")`;

    const userPrompt = `Document type: ${documentType}
Title: ${title}

Content:
${content.slice(0, 4000)}`;

    const aiResp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.2,
        }),
      }
    );

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI extraction failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const raw = aiData.choices?.[0]?.message?.content || "[]";

    // Parse JSON array from response (strip markdown fences if present)
    let keywords: string[] = [];
    try {
      const cleaned = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      keywords = JSON.parse(cleaned);
      if (!Array.isArray(keywords)) keywords = [];
      keywords = keywords
        .filter((k: unknown) => typeof k === "string" && k.trim())
        .map((k: string) => k.trim().toLowerCase())
        .slice(0, 30);
    } catch {
      console.error("Failed to parse keywords:", raw);
      return new Response(JSON.stringify({ keywords: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save to worksheets.meta using service role
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: ws } = await adminClient
      .from("worksheets")
      .select("meta")
      .eq("id", worksheetId)
      .single();

    const currentMeta = (ws?.meta as Record<string, unknown>) || {};
    const newMeta = {
      ...currentMeta,
      keywords,
      keywords_updated_at: new Date().toISOString(),
    };

    await adminClient
      .from("worksheets")
      .update({ meta: newMeta })
      .eq("id", worksheetId);

    return new Response(JSON.stringify({ keywords }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-keywords error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
