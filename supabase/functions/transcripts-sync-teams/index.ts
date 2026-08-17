import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, parseVtt } from "../_shared/transcripts.ts";

/**
 * Pulls the signed-in recruiter's OWN Microsoft Teams meeting transcripts using an
 * application (system) Graph token. See docs/teams-transcripts.md.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const tenant = Deno.env.get("MS_TENANT_ID");
    const clientId = Deno.env.get("MS_CLIENT_ID");
    const clientSecret = Deno.env.get("MS_CLIENT_SECRET");
    if (!tenant || !clientId || !clientSecret) {
      return json({ error: "Microsoft Teams sync is not configured yet. Ask an admin to add the Microsoft application credentials." }, 400);
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: link } = await admin
      .from("user_integrations")
      .select("external_user_id, external_email")
      .eq("user_id", user.id)
      .eq("provider", "microsoft")
      .maybeSingle();

    const msIdentity = link?.external_user_id || link?.external_email || user.email;
    if (!msIdentity) {
      return json({ error: "Your Microsoft account is not linked yet. Link it in Transcripts → Connections before syncing." }, 400);
    }

    // System (client credentials) token
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    });
    if (!tokenRes.ok) return json({ error: `Microsoft authentication failed: ${await tokenRes.text()}` }, 502);
    const { access_token } = await tokenRes.json();
    const g = (path: string) =>
      fetch(`https://graph.microsoft.com/v1.0${path}`, { headers: { Authorization: `Bearer ${access_token}` } });

    // Meetings the recruiter organised in the last 30 days
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const eventsRes = await g(
      `/users/${encodeURIComponent(msIdentity)}/events?$filter=start/dateTime ge '${since}' and isOnlineMeeting eq true&$select=subject,start,onlineMeeting,attendees&$top=50`,
    );
    if (eventsRes.status === 404) {
      return json({ error: "We could not find your Microsoft account in the company directory. Ask an admin to link it." }, 400);
    }
    if (!eventsRes.ok) return json({ error: `Microsoft Graph error: ${await eventsRes.text()}` }, 502);
    const events = (await eventsRes.json()).value ?? [];

    let imported = 0, skipped = 0;
    for (const ev of events) {
      const joinUrl = ev?.onlineMeeting?.joinUrl;
      if (!joinUrl) { skipped++; continue; }

      const meetingRes = await g(
        `/users/${encodeURIComponent(msIdentity)}/onlineMeetings?$filter=JoinWebUrl eq '${joinUrl}'`,
      );
      if (!meetingRes.ok) { skipped++; continue; }
      const meeting = (await meetingRes.json()).value?.[0];
      if (!meeting) { skipped++; continue; }

      const listRes = await g(`/users/${encodeURIComponent(msIdentity)}/onlineMeetings/${meeting.id}/transcripts`);
      if (!listRes.ok) { skipped++; continue; }
      const transcript = (await listRes.json()).value?.[0];
      if (!transcript) { skipped++; continue; }

      const externalId = `${meeting.id}:${transcript.id}`;
      const { data: existing } = await admin
        .from("transcripts").select("id")
        .eq("user_id", user.id).eq("source", "teams").eq("external_id", externalId).maybeSingle();
      if (existing) { skipped++; continue; }

      const contentRes = await g(
        `/users/${encodeURIComponent(msIdentity)}/onlineMeetings/${meeting.id}/transcripts/${transcript.id}/content?$format=text/vtt`,
      );
      if (!contentRes.ok) { skipped++; continue; }
      const { segments, text } = parseVtt(await contentRes.text());
      if (!text) { skipped++; continue; }

      await admin.from("transcripts").insert({
        user_id: user.id,
        source: "teams",
        title: ev.subject || "Teams meeting",
        external_id: externalId,
        occurred_at: ev?.start?.dateTime ? new Date(ev.start.dateTime + "Z").toISOString() : null,
        participants: (ev.attendees ?? []).map((a: any) => a?.emailAddress?.name || a?.emailAddress?.address).filter(Boolean),
        content_text: text,
        segments,
        status: "ready",
      });
      imported++;
    }

    return json({ imported, skipped, processing: 0 });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
