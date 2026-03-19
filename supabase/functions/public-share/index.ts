import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response(JSON.stringify({ error: "Missing token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up share link
    const { data: link, error: linkError } = await supabaseAdmin
      .from("public_share_links")
      .select("*")
      .eq("share_token", token)
      .single();

    if (linkError || !link) {
      return new Response(JSON.stringify({ error: "Link not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!link.is_active) {
      return new Response(JSON.stringify({ error: "Link deactivated" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Link expired" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch worksheet
    const { data: worksheet, error: wsError } = await supabaseAdmin
      .from("worksheets")
      .select("id, title, document_type, content_html, content_md, meta")
      .eq("id", link.worksheet_id)
      .single();

    if (wsError || !worksheet) {
      return new Response(JSON.stringify({ error: "Worksheet not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log view
    const viewerIp = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null;
    const userAgent = req.headers.get("user-agent") || null;

    await supabaseAdmin.from("share_link_views").insert({
      share_link_id: link.id,
      viewer_ip: viewerIp,
      user_agent: userAgent,
    });

    // Replace private attachment URLs in design_html with fresh signed URLs
    const meta = worksheet.meta as Record<string, unknown> | null;
    let designHtml = (meta?.design_html as string) || null;

    if (designHtml) {
      const { data: attachments } = await supabaseAdmin
        .from("worksheet_attachments")
        .select("file_path")
        .eq("worksheet_id", link.worksheet_id);

      if (attachments?.length) {
        for (const att of attachments) {
          // Replace raw file_path references
          const escapedPath = att.file_path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (designHtml.includes(att.file_path)) {
            const { data: signed } = await supabaseAdmin.storage
              .from("attachments")
              .createSignedUrl(att.file_path, 86400); // 24 hours
            if (signed?.signedUrl) {
              designHtml = designHtml.replaceAll(att.file_path, signed.signedUrl);
            }
          }
          // Also replace any existing signed URLs for this file (they may have expired)
          const signedUrlPattern = new RegExp(
            `https?://[^"'\\s]*?/storage/v1/object/sign/attachments/${escapedPath}[^"'\\s]*`,
            'g'
          );
          const matches = designHtml.match(signedUrlPattern);
          if (matches?.length) {
            const { data: signed } = await supabaseAdmin.storage
              .from("attachments")
              .createSignedUrl(att.file_path, 86400);
            if (signed?.signedUrl) {
              for (const m of matches) {
                designHtml = designHtml.replaceAll(m, signed.signedUrl);
              }
            }
          }
        }
      }
    }

    // Return worksheet data
    return new Response(
      JSON.stringify({
        title: worksheet.title,
        document_type: worksheet.document_type,
        content_html: worksheet.content_html,
        content_md: worksheet.content_md,
        design_html: designHtml,
        recipient_name: link.recipient_name,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
