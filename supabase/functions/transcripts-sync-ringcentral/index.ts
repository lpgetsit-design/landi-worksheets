import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/transcripts.ts";

/**
 * Pulls the signed-in recruiter's OWN recorded RingCentral voice calls with a system
 * (JWT grant) token, sends the audio to AssemblyAI, and stores readable transcripts.
 * See docs/ringcentral-transcripts.md.
 */

async function rcToken() {
  const server = Deno.env.get("RINGCENTRAL_SERVER_URL") ?? "https://platform.ringcentral.com";
  const id = Deno.env.get("RINGCENTRAL_CLIENT_ID");
  const secret = Deno.env.get("RINGCENTRAL_CLIENT_SECRET");
  const jwt = Deno.env.get("RINGCENTRAL_JWT");
  if (!id || !secret || !jwt) return { error: "RingCentral sync is not configured yet. Ask an admin to add the RingCentral application credentials." };
  const res = await fetch(`${server}/restapi/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) return { error: `RingCentral authentication failed: ${await res.text()}` };
  const data = await res.json();
  return { server, token: data.access_token as string };
}

async function assemblyTranscribe(apiKey: string, audio: Blob) {
  const up = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: { authorization: apiKey },
    body: audio,
  });
  if (!up.ok) throw new Error(`AssemblyAI upload failed: ${await up.text()}`);
  const { upload_url } = await up.json();

  const created = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: { authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ audio_url: upload_url, speaker_labels: true }),
  });
  if (!created.ok) throw new Error(`AssemblyAI request failed: ${await created.text()}`);
  return (await created.json()).id as string;
}

async function assemblyFetch(apiKey: string, jobId: string) {
  const res = await fetch(`https://api.assemblyai.com/v2/transcript/${jobId}`, { headers: { authorization: apiKey } });
  if (!res.ok) throw new Error(`AssemblyAI status failed: ${await res.text()}`);
  return await res.json();
}

function toSegments(job: any) {
  const utterances = job.utterances ?? [];
  if (utterances.length === 0) return { segments: [], text: job.text ?? "" };
  const segments = utterances.map((u: any) => ({ speaker: `Speaker ${u.speaker}`, text: u.text }));
  return { segments, text: segments.map((s: any) => `${s.speaker}: ${s.text}`).join("\n\n") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const assemblyKey = Deno.env.get("ASSEMBLYAI_API_KEY");
    if (!assemblyKey) return json({ error: "Speech-to-text is not configured yet. Ask an admin to add the AssemblyAI key." }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 1. Finish anything still processing from a previous sync.
    let completed = 0, stillProcessing = 0;
    const { data: pending } = await admin
      .from("transcripts").select("id, provider_job_id")
      .eq("user_id", user.id).eq("source", "ringcentral").eq("status", "processing");
    for (const row of pending ?? []) {
      if (!row.provider_job_id) continue;
      const job = await assemblyFetch(assemblyKey, row.provider_job_id);
      if (job.status === "completed") {
        const { segments, text } = toSegments(job);
        await admin.from("transcripts").update({ status: "ready", content_text: text, segments }).eq("id", row.id);
        completed++;
      } else if (job.status === "error") {
        await admin.from("transcripts").update({ status: "failed", error_message: job.error ?? "Transcription failed" }).eq("id", row.id);
      } else stillProcessing++;
    }

    // 2. Pull new recorded calls.
    const { data: link } = await admin
      .from("user_integrations").select("external_user_id")
      .eq("user_id", user.id).eq("provider", "ringcentral").maybeSingle();
    const extensionId = link?.external_user_id;
    if (!extensionId) {
      return json({ error: "Your RingCentral extension is not linked yet. Link it in Transcripts → Connections before syncing.", completed, processing: stillProcessing }, 400);
    }

    const auth = await rcToken();
    if ("error" in auth) return json({ error: auth.error, completed, processing: stillProcessing }, 400);

    const from = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const logRes = await fetch(
      `${auth.server}/restapi/v1.0/account/~/extension/${encodeURIComponent(extensionId)}/call-log?type=Voice&withRecording=true&dateFrom=${from}&perPage=50`,
      { headers: { Authorization: `Bearer ${auth.token}` } },
    );
    if (logRes.status === 404) return json({ error: "We could not find your RingCentral extension. Ask an admin to re-link it.", completed, processing: stillProcessing }, 400);
    if (!logRes.ok) return json({ error: `RingCentral error: ${await logRes.text()}`, completed, processing: stillProcessing }, 502);
    const records = (await logRes.json()).records ?? [];

    let imported = 0, skipped = 0;
    for (const rec of records) {
      const recording = rec.recording;
      if (!recording?.contentUri) { skipped++; continue; }

      const { data: existing } = await admin
        .from("transcripts").select("id")
        .eq("user_id", user.id).eq("source", "ringcentral").eq("external_id", String(recording.id)).maybeSingle();
      if (existing) { skipped++; continue; }

      const audioRes = await fetch(recording.contentUri, { headers: { Authorization: `Bearer ${auth.token}` } });
      if (!audioRes.ok) { skipped++; continue; }
      const audio = await audioRes.blob();

      const filePath = `${user.id}/ringcentral/${recording.id}.mp3`;
      await admin.storage.from("transcripts").upload(filePath, audio, { contentType: "audio/mpeg", upsert: true });

      const jobId = await assemblyTranscribe(assemblyKey, audio);
      const counterparty = rec.direction === "Inbound" ? rec.from?.name || rec.from?.phoneNumber : rec.to?.name || rec.to?.phoneNumber;

      await admin.from("transcripts").insert({
        user_id: user.id,
        source: "ringcentral",
        title: `Call with ${counterparty ?? "unknown number"}`,
        external_id: String(recording.id),
        occurred_at: rec.startTime ?? null,
        duration_seconds: rec.duration ?? null,
        participants: [rec.from?.phoneNumber, rec.to?.phoneNumber].filter(Boolean),
        status: "processing",
        provider_job_id: jobId,
        file_path: filePath,
        file_name: `${recording.id}.mp3`,
        file_size: audio.size,
      });
      imported++;
      stillProcessing++;
    }

    return json({ imported, skipped, completed, processing: stillProcessing });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
