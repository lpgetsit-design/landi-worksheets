

## Plan: Disable document type change for Design worksheets with content

**What**: When a worksheet is of type "design" and has HTML content (`content_html` / `designHtml` is non-empty), the document type dropdown should be disabled to prevent switching away from design mode.

**How**:

### File: `src/pages/WorksheetPage.tsx` (lines ~263-274)

Add a `disabled` prop to the `Select` component:

```tsx
const isDesignLocked = worksheetType === "design" && !!designHtml;

<Select
  value={worksheetType}
  onValueChange={(v) => handleUpdateDocumentType(v as DocumentType)}
  disabled={isDesignLocked}
>
```

This is a single-line logic addition. The `designHtml` state already exists in the component (set from `worksheet.content_html`). When locked, the dropdown will appear grayed out and unclickable, clearly signaling the type cannot be changed.

