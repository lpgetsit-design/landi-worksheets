# RingCentral call transcripts — technical design

Edge function: `supabase/functions/transcripts-sync-ringcentral`.

- Auth: caller's Supabase JWT identifies the recruiter; the function obtains a
  **system JWT-grant** RingCentral token from `RINGCENTRAL_CLIENT_ID` /
  `RINGCENTRAL_CLIENT_SECRET` / `RINGCENTRAL_JWT` against `RINGCENTRAL_SERVER_URL`.
- Scoping: `public.user_integrations` (provider `ringcentral`) stores the recruiter's
  extension id. Call logs are read from
  `/restapi/v1.0/account/~/extension/{extensionId}/call-log?type=Voice&withRecording=true`,
  so only that recruiter's recorded voice calls are returned.
- Speech-to-text: RingCentral returns audio only. The recording is stored in the private
  `transcripts` bucket under `{userId}/ringcentral/...` and uploaded to **AssemblyAI**
  (`ASSEMBLYAI_API_KEY`) with `speaker_labels: true`. The row is inserted with
  `status = 'processing'` and the AssemblyAI job id in `provider_job_id`.
- Completion: every sync first polls outstanding `processing` rows and promotes finished
  jobs to `status = 'ready'` with speaker segments; failures become `status = 'failed'`.
  The UI tells the recruiter to sync again for anything still transcribing.
- Dedupe: unique index on `(user_id, source, external_id)` where `external_id` is the
  RingCentral recording id. Calls without a recording are skipped.
