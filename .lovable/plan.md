

## Public Sharing Feature — Seismic-style One-Click Publish

### Overview
Add a tokenized public sharing system where worksheet owners can generate unique share links for specific recipients. Recipients view content without signing in. All views are tracked for marketing analytics.

### Database Changes (Migration)

**New table: `public_share_links`**
- `id` uuid PK
- `worksheet_id` uuid (FK to worksheets)
- `created_by` uuid (the owner's user_id)
- `recipient_name` text NOT NULL
- `recipient_email` text (nullable, for tracking)
- `recipient_company` text (nullable)
- `share_token` text UNIQUE NOT NULL (crypto-random, URL-safe)
- `is_active` boolean DEFAULT true
- `expires_at` timestamptz (nullable, for optional expiry)
- `created_at` timestamptz DEFAULT now()

**New table: `share_link_views`**
- `id` uuid PK
- `share_link_id` uuid (FK to public_share_links)
- `viewed_at` timestamptz DEFAULT now()
- `viewer_ip` text (nullable)
- `user_agent` text (nullable)
- `duration_seconds` integer (nullable, for future use)

**RLS policies:**
- `public_share_links`: Owners can CRUD their own links. Anon/public can SELECT by `share_token` (needed for the public view edge function).
- `share_link_views`: Anon can INSERT (to log views). Owners can SELECT views for their own links.

### Edge Function: `public-share`

A new edge function that serves as the public endpoint. It:
1. Accepts a `token` query param
2. Looks up the share link (validates active, not expired)
3. Fetches the worksheet data (using service role key to bypass RLS)
4. Logs a view in `share_link_views`
5. Returns the worksheet data (title, content_html/content_md for read-only worksheets, or `meta.design_html` for designs)

### Frontend Changes

**1. New public route: `/s/:token`**
- Added to `App.tsx` outside of `AuthProvider`/`ProtectedRoute`
- No header, no auth required
- For designs: renders the full-page HTML in an iframe (like DesignPreview)
- For worksheets: renders read-only HTML content with clean styling
- Shows a minimal branded footer ("Powered by Landi")

**2. New page: `src/pages/PublicSharePage.tsx`**
- Fetches worksheet via the `public-share` edge function using the token
- Renders design HTML in iframe or worksheet content as read-only HTML
- Shows "Link expired" or "Not found" states

**3. Share dialog on WorksheetPage**
- New "Share" button in the header bar (next to AI button)
- Opens a dialog/popover with:
  - Recipient name (required), email (optional), company (optional)
  - "Generate Link" button — creates the share record, shows copyable URL
  - List of existing share links for this worksheet with:
    - Recipient name, created date, view count
    - Copy link, toggle active/deactivate
- One-click flow: fill name → click → link is copied to clipboard

**4. `src/lib/worksheets.ts`**
- Add helper functions: `createShareLink`, `getShareLinks`, `toggleShareLink`

### Technical Details

```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Owner clicks   │────▶│  public_share_    │────▶│  Copyable URL   │
│  "Share" button │     │  links table      │     │  /s/{token}     │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │  Edge function   │
                                                 │  validates token │
                                                 │  logs view       │
                                                 │  returns content │
                                                 └─────────────────┘
```

- Share tokens: 32-char random hex via `crypto.randomUUID()` or similar
- The public page URL format: `https://landi-worksheets.lovable.app/s/{token}`
- Edge function uses `SUPABASE_SERVICE_ROLE_KEY` to read worksheet data (bypasses user RLS)

### Files to Create/Modify
- **Create**: Migration SQL for `public_share_links` and `share_link_views` tables
- **Create**: `supabase/functions/public-share/index.ts` — public content endpoint
- **Create**: `src/pages/PublicSharePage.tsx` — public viewer page
- **Create**: `src/components/share/ShareDialog.tsx` — share management UI
- **Modify**: `src/App.tsx` — add `/s/:token` public route
- **Modify**: `src/pages/WorksheetPage.tsx` — add Share button in header
- **Modify**: `src/lib/worksheets.ts` — add share link CRUD helpers

