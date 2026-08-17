# Microsoft Teams transcripts — technical design

Edge function: `supabase/functions/transcripts-sync-teams`.

- Auth: caller's Supabase JWT identifies the recruiter; the function then obtains an
  **application (client credentials)** Microsoft Graph token from
  `MS_TENANT_ID` / `MS_CLIENT_ID` / `MS_CLIENT_SECRET`.
- Scoping: `public.user_integrations` (provider `microsoft`) stores the recruiter's
  Microsoft identity. Every Graph call is made against `/users/{that identity}` only,
  so a recruiter can never receive another person's meetings.
- Flow: list the user's online-meeting calendar events (last 30 days) →
  resolve `onlineMeetings?$filter=JoinWebUrl eq '<joinUrl>'` → list
  `/onlineMeetings/{id}/transcripts` → fetch `content?$format=text/vtt`.
- Parsing: `_shared/transcripts.ts#parseVtt` turns the VTT into speaker-labelled segments.
- Dedupe: unique index on `(user_id, source, external_id)` where `external_id = "<meetingId>:<transcriptId>"`.
  Meetings without a transcript are skipped.
- Required Graph application permissions: `OnlineMeetingTranscript.Read.All`,
  `OnlineMeetings.Read.All`, `Calendars.Read` (plus an application access policy granting
  the app access to the users it syncs).
