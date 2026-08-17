export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Convert a WebVTT / SRT style transcript into speaker-labelled segments + plain text. */
export function parseVtt(vtt: string): { segments: { speaker: string; text: string }[]; text: string } {
  const lines = vtt.split(/\r?\n/);
  const segments: { speaker: string; text: string }[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line === "WEBVTT" || /^\d+$/.test(line) || line.includes("-->")) continue;
    const m = line.match(/^<v\s+([^>]+)>(.*?)(<\/v>)?$/);
    const speaker = m ? m[1].trim() : "Speaker";
    const text = (m ? m[2] : line).replace(/<[^>]+>/g, "").trim();
    if (!text) continue;
    const last = segments[segments.length - 1];
    if (last && last.speaker === speaker) last.text += " " + text;
    else segments.push({ speaker, text });
  }
  return { segments, text: segments.map((s) => `${s.speaker}: ${s.text}`).join("\n\n") };
}
