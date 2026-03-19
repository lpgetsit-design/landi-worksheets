

# File Attachments with AI Metadata

## Overview

Add file attachment support to worksheets — users can upload multimedia files (audio, video, docs, PDFs, VTT, etc.), mention them inline as badges in the editor, and get AI-generated title/description metadata for each file.

## Architecture

```text
┌─────────────┐     ┌──────────────────┐     ┌────────────────────┐
│  Storage     │     │  worksheet_      │     │  TipTap Editor     │
│  Bucket:     │────▶│  attachments     │────▶│  fileBadge node    │
│  attachments │     │  (DB table)      │     │  (inline mention)  │
└─────────────┘     └──────────────────┘     └────────────────────┘
                           │
                    ┌──────┴──────┐
                    │ Edge Fn:    │
                    │ attachment- │
                    │ metadata    │
                    └─────────────┘
```

## Step 1: Database & Storage

**Storage bucket** `attachments` (public, so files can be previewed/downloaded).

**New table** `worksheet_attachments`:
- `id` (uuid, PK)
- `worksheet_id` (uuid, FK → worksheets)
- `user_id` (uuid, not null)
- `file_path` (text) — storage path
- `file_name` (text) — original filename
- `file_type` (text) — MIME type
- `file_size` (bigint)
- `title` (text, default '') — AI-generated or user-edited
- `description` (text, default '') — AI-generated or user-edited
- `meta` (jsonb, default '{}') — extra AI metadata
- `created_at`, `updated_at`

**RLS**: Owner-based using `is_worksheet_owner` helper + user_id = auth.uid() for insert.

## Step 2: Edge Function — `attachment-metadata`

New edge function that:
1. Accepts `{ fileUrl, fileName, fileType, worksheetId, attachmentId }`
2. Uses Lovable AI (gemini-3-flash-preview) to analyze the file:
   - For documents/text: fetches content, sends to AI for title + description
   - For audio/video: uses filename + type to suggest title/description
   - For images: sends image URL to multimodal model
3. Updates the `worksheet_attachments` row with AI-generated `title`, `description`, and any extra `meta`
4. Returns the generated metadata

## Step 3: File Upload UI — `AttachmentPanel`

A panel/section in the worksheet page (collapsible, below the toolbar or in a sidebar tab) showing:
- **Upload button** (drag-and-drop or file picker, accepts all file types)
- **List of attachments** as cards showing: thumbnail/icon, title, description, file type badge, file size
- **Edit** title/description inline
- **AI Generate** button per attachment (or "Generate All" bulk button) to call the edge function
- **Delete** attachment
- **Insert into editor** button → inserts a `fileBadge` inline node

## Step 4: TipTap `fileBadge` Node

New inline atom node (like `crmBadge` / `worksheetBadge`):
- Attrs: `attachmentId`, `fileName`, `fileType`, `title`
- Renders as an inline badge with file icon + title
- Clicking opens/downloads the file
- Add to UnifiedMentionExtension as a third category: "Attach File"

## Step 5: Mention Integration

Add "Attach File" as a third option in `UnifiedMentionMenu`:
- When selected, shows list of existing attachments for this worksheet
- Selecting one inserts a `fileBadge` node
- Optionally add an "Upload new" option at the top

## Step 6: Turndown + Markdown Serialization

Add turndown rule for `fileBadge` → `[[FILE:attachmentId:title]]` placeholder, and restore function for AI content rendering.

## Step 7: Wire into WorksheetPage

- Add attachment state and queries
- Pass worksheet attachments to AIChatPanel context so the AI assistant knows about attached files
- Add the AttachmentPanel to the worksheet layout

## Files to Create/Modify

| Action | File |
|--------|------|
| Create | `supabase/functions/attachment-metadata/index.ts` |
| Create | `src/components/editor/FileBadgeNode.ts` |
| Create | `src/components/editor/FileBadgeView.tsx` |
| Create | `src/components/attachments/AttachmentPanel.tsx` |
| Create | `src/components/attachments/AttachmentCard.tsx` |
| Create | `src/hooks/useWorksheetAttachments.ts` |
| Create | `src/lib/attachments.ts` (upload, CRUD, AI metadata helpers) |
| Modify | `src/components/editor/WorksheetEditor.tsx` (add FileBadgeNode extension) |
| Modify | `src/components/editor/UnifiedMentionExtension.ts` (add file category) |
| Modify | `src/components/editor/UnifiedMentionMenu.tsx` (add file search/list) |
| Modify | `src/pages/WorksheetPage.tsx` (add AttachmentPanel, wire state) |
| Modify | `supabase/config.toml` (add attachment-metadata function) |
| Migration | Create storage bucket + worksheet_attachments table + RLS |

