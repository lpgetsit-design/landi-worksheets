import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the calling user
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader! } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { worksheetId, title, content } = await req.json();
    if (!worksheetId || !content?.trim()) {
      return new Response(JSON.stringify({ error: "worksheetId and content required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build text to embed: title + content
    const textToEmbed = `${title || "Untitled"}\n\n${content}`.slice(0, 8000);

    // Simple content hash to skip re-embedding unchanged content
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(textToEmbed));
    const contentHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Check if embedding already exists with same hash
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: existing } = await adminClient
      .from("worksheet_embeddings")
      .select("content_hash")
      .eq("worksheet_id", worksheetId)
      .single();

    if (existing?.content_hash === contentHash) {
      return new Response(JSON.stringify({ status: "unchanged" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call OpenAI embeddings API
    const embResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: textToEmbed,
      }),
    });

    if (!embResponse.ok) {
      const errText = await embResponse.text();
      console.error("OpenAI embeddings error:", embResponse.status, errText);
      return new Response(JSON.stringify({ error: "Embedding generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const embData = await embResponse.json();
    const embedding = embData.data?.[0]?.embedding;
    if (!embedding) throw new Error("No embedding returned");

    // Upsert embedding
    const { error: upsertError } = await adminClient
      .from("worksheet_embeddings")
      .upsert(
        {
          worksheet_id: worksheetId,
          embedding: JSON.stringify(embedding),
          content_hash: contentHash,
        },
        { onConflict: "worksheet_id" }
      );

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      throw upsertError;
    }

    return new Response(JSON.stringify({ status: "embedded" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("embed error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
