

# Private Attachments with Shared Design Access

## Problem
Attachments are private (good), but when a design is shared via a public share link, embedded attachment URLs (e.g., images used in the design HTML) are inaccessible to the recipient because they require authentication.

## Approach
Instead of physically copying files, the `public-share` edge function will generate fresh signed URLs for any attachments referenced in the design HTML. Access is gated by the share token — no token, no access. This achieves the same security model as copying (permissions match the share link) without duplicating storage.

```text
Recipient visits /s/{token}
        │
        ▼
public-share edge function
        │
   ┌────┴─────────────────┐
   │ 1. Validate token    │
   │ 2. Fetch design_html │
   │ 3. Fetch attachments │
   │ 4. Scan HTML for      │
   │    attachment URLs    │
   │ 5. Replace with fresh │
   │    signed URLs (24h)  │
   │ 6. Return HTML        │
   └──────────────────────┘
```

## Changes

### 1. Update `public-share` edge function
- After fetching the worksheet, also fetch its `worksheet_attachments`
- Scan `design_html` for any references to the attachments bucket (signed URL patterns or file paths)
- Use service role to generate fresh signed URLs (24-hour expiry)
- Replace all matching URLs in the HTML before returning
- Also return attachment metadata so the public page can reference files

### 2. Update `design-chat` edge function
- When the AI generates design HTML using attachments, ensure it uses the signed URLs provided in the attachment context
- These URLs will naturally appear in `design_html` stored in `meta`

### 3. No database changes needed
- The private bucket + RLS is already correct
- The share token validation in `public-share` gates all access
- No new tables or buckets required

## Technical Detail

In `public-share/index.ts`, after fetching the worksheet:

```typescript
// Fetch attachments for this worksheet
const { data: attachments } = await supabaseAdmin
  .from("worksheet_attachments")
  .select("*")
  .eq("worksheet_id", link.worksheet_id);

// Generate signed URLs and replace in design_html
let designHtml = meta?.design_html || null;
if (designHtml && attachments?.length) {
  for (const att of attachments) {
    const { data: signed } = await supabaseAdmin.storage
      .from("attachments")
      .createSignedUrl(att.file_path, 86400); // 24 hours
    if (signed?.signedUrl) {
      // Replace any occurrence of the file path or old signed URL
      designHtml = designHtml.replaceAll(
        new RegExp(att.file_path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        signed.signedUrl
      );
    }
  }
}
```

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/public-share/index.ts` | Fetch attachments, generate signed URLs, replace in design_html |
| `supabase/functions/design-chat/index.ts` | Ensure attachment URLs in system prompt use identifiable paths for replacement |

