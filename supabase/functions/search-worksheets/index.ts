import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader! } },
    });
    const {
      data: { user },
      error: authError,
    } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { query, matchCount = 20 } = await req.json();
    if (!query?.trim()) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // Run embedding generation + keyword extraction in parallel
    const queryText = query.slice(0, 4000);

    const [embeddingResult, keywordsResult] = await Promise.all([
      // 1. Generate query embedding via OpenAI
      (async () => {
        if (!OPENAI_API_KEY) return null;
        const resp = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: queryText,
          }),
        });
        if (!resp.ok) {
          console.error("OpenAI embedding error:", resp.status);
          return null;
        }
        const data = await resp.json();
        return data.data?.[0]?.embedding || null;
      })(),

      // 2. Extract search keywords via Lovable AI
      (async () => {
        if (!LOVABLE_API_KEY) return [];
        const resp = await fetch(
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
                {
                  role: "system",
                  content: `Extract 3-15 search keywords from the user's search query. These will be matched against document keyword tags in a recruiting business system.
Return ONLY a JSON array of lowercase strings. Focus on:
- Job titles, roles, positions
- Skills, technologies, certifications
- Company/people names
- Industry terms
- Recruiting workflow terms (sourcing, screening, placement, onboarding)
- Document types (job description, resume, invoice, SOW)
Normalize: lowercase, singular forms, standardize synonyms.`,
                },
                { role: "user", content: queryText },
              ],
              temperature: 0.1,
            }),
          }
        );
        if (!resp.ok) return [];
        const data = await resp.json();
        const raw = data.choices?.[0]?.message?.content || "[]";
        try {
          const cleaned = raw
            .replace(/```json?\s*/g, "")
            .replace(/```/g, "")
            .trim();
          const parsed = JSON.parse(cleaned);
          if (!Array.isArray(parsed)) return [];
          return parsed
            .filter((k: unknown) => typeof k === "string" && k.trim())
            .map((k: string) => k.trim().toLowerCase())
            .slice(0, 15);
        } catch {
          return [];
        }
      })(),
    ]);

    if (!embeddingResult) {
      return new Response(
        JSON.stringify({ error: "Could not generate query embedding" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Call hybrid search DB function
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: results, error: searchError } = await adminClient.rpc(
      "hybrid_search_worksheets",
      {
        _query_embedding: JSON.stringify(embeddingResult),
        _query_keywords: keywordsResult,
        _user_id: user.id,
        _match_count: matchCount,
      }
    );

    if (searchError) {
      console.error("Hybrid search error:", searchError);
      return new Response(JSON.stringify({ error: "Search failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter out zero-score results and return
    const filtered = (results || []).filter(
      (r: any) => r.combined_score > 0.01
    );

    return new Response(
      JSON.stringify({
        results: filtered,
        queryKeywords: keywordsResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("search-worksheets error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
