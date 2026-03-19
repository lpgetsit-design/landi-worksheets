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
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // field: "title" | "description" | "both" (default "both" for backwards compat)
    const { attachmentId, fileName, fileType, filePath, field = "both" } = await req.json();

    if (!attachmentId || !fileName)
      return new Response(
        JSON.stringify({ error: "attachmentId and fileName are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY)
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );

    const isImage = fileType?.startsWith("image/");
    const isAudio = fileType?.startsWith("audio/");
    const isVideo = fileType?.startsWith("video/");
    const isText =
      fileType?.startsWith("text/") ||
      fileType === "application/json" ||
      fileType === "application/xml";
    const isDocument =
      fileType === "application/pdf" ||
      fileType?.includes("word") ||
      fileType?.includes("spreadsheet") ||
      fileType?.includes("excel") ||
      fileType?.includes("presentation") ||
      fileType?.includes("powerpoint");

    // Generate signed URL for the file (private bucket)
    let fileUrl: string | null = null;
    if (filePath) {
      const { data: signedData } = await supabaseAdmin.storage
        .from("attachments")
        .createSignedUrl(filePath, 600);
      fileUrl = signedData?.signedUrl ?? null;
    }

    // Build field-specific instructions
    let fieldInstruction: string;
    let toolParams: Record<string, any>;
    let requiredFields: string[];

    if (field === "title") {
      fieldInstruction = `Generate ONLY a concise, descriptive title (max 8 words) for this file. Return a JSON object with a "title" key.`;
      toolParams = { title: { type: "string", description: "Concise title, max 8 words" } };
      requiredFields = ["title"];
    } else if (field === "description") {
      fieldInstruction = `Generate ONLY a brief description (1-2 sentences) that captures the content/purpose of this file. Return a JSON object with a "description" key.`;
      toolParams = { description: { type: "string", description: "Brief description, 1-2 sentences" } };
      requiredFields = ["description"];
    } else {
      fieldInstruction = `Generate a concise, descriptive title (max 8 words) and a brief description (1-2 sentences). Return a JSON object with "title" and "description" keys.`;
      toolParams = {
        title: { type: "string", description: "Concise title, max 8 words" },
        description: { type: "string", description: "Brief description, 1-2 sentences" },
      };
      requiredFields = ["title", "description"];
    }

    let userContent: any;

    if (isImage && fileUrl) {
      userContent = [
        {
          type: "text",
          text: `Analyze this image file named "${fileName}" (type: ${fileType}). ${fieldInstruction}`,
        },
        { type: "image_url", image_url: { url: fileUrl } },
      ];
    } else {
      let contextHint = "";
      if (isAudio)
        contextHint = `This is an audio file named "${fileName}" (type: ${fileType}).`;
      else if (isVideo)
        contextHint = `This is a video file named "${fileName}" (type: ${fileType}).`;
      else if (isDocument)
        contextHint = `This is a document file named "${fileName}" (type: ${fileType}).`;
      else if (isText)
        contextHint = `This is a text file named "${fileName}" (type: ${fileType}).`;
      else
        contextHint = `This is a file named "${fileName}" (type: ${fileType || "unknown"}).`;

      userContent = `${contextHint}\n\nBased on the file name and type, ${fieldInstruction}`;
    }

    const aiResp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content:
                'You generate metadata for uploaded files. Always respond with a valid JSON object. No markdown fences, no extra text.',
            },
            { role: "user", content: userContent },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "set_metadata",
                description: "Set the metadata for the file",
                parameters: {
                  type: "object",
                  properties: toolParams,
                  required: requiredFields,
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "set_metadata" } },
        }),
      }
    );

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    let title: string | undefined;
    let description: string | undefined;

    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall) {
        const args = JSON.parse(toolCall.function.arguments);
        if (field === "title" || field === "both") title = args.title || fileName;
        if (field === "description" || field === "both") description = args.description || "";
      }
    } catch (e) {
      console.error("Failed to parse AI response:", e);
    }

    // Build update object with only the requested field(s)
    const updateObj: Record<string, any> = { meta: { ai_generated: true, ai_field: field } };
    if (title !== undefined) updateObj.title = title;
    if (description !== undefined) updateObj.description = description;

    const { error: updateError } = await supabaseAdmin
      .from("worksheet_attachments")
      .update(updateObj)
      .eq("id", attachmentId);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update attachment" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ title, description }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("attachment-metadata error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
