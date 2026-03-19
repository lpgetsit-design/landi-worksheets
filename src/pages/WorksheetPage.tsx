import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MessageSquare, ArrowLeft, FileText, Loader2, RefreshCw, Download, Share2, Paintbrush, PenLine, Paperclip, HelpCircle } from "lucide-react";
import ShareDialog from "@/components/share/ShareDialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import WorksheetEditor from "@/components/editor/WorksheetEditor";
import type { WorksheetEditorHandle } from "@/components/editor/WorksheetEditor";
import AIChatPanel from "@/components/chat/AIChatPanel";
import DesignPreview from "@/components/design/DesignPreview";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getWorksheet, updateWorksheet, generateAndSaveSummary } from "@/lib/worksheets";
import type { DocumentType } from "@/lib/worksheets";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { marked } from "marked";
import AttachmentPanel from "@/components/attachments/AttachmentPanel";
import { useAuth } from "@/components/AuthProvider";
import type { Attachment } from "@/lib/attachments";
import { getSignedUrl } from "@/lib/attachments";
import { useWorksheetAttachments } from "@/hooks/useWorksheetAttachments";
import TourOverlay from "@/components/tour/TourOverlay";
import { worksheetSteps } from "@/components/tour/tourSteps";
import { useTour } from "@/hooks/useTour";

// ─── PDF helpers ───
const openDesignPdf = (html: string) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) { alert('Please allow popups to download as PDF'); return; }
  const printCss = `
    @page { size: A4; margin: 0; }
    @media print {
      html, body { width: 210mm; min-height: 297mm; margin: 0 !important; padding: 0 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      * { box-shadow: none !important; }
      .container, [class*="container"] { max-width: 100% !important; margin: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
    }
    @media screen {
      body::before { content: "Close this tab after saving your PDF"; display: block; background: #0e363c; color: #f9f9f9; text-align: center; padding: 8px; font-family: system-ui, sans-serif; font-size: 13px; }
    }
  `;
  const printHtml = html.replace(
    '</head>',
    `<style>${printCss}</style><script>window.onload=function(){document.fonts.ready.then(function(){setTimeout(function(){window.print();},300);});};${'<'}/script></head>`
  );
  printWindow.document.open();
  printWindow.document.write(printHtml);
  printWindow.document.close();
};

const openEditorPdf = (editorRef: React.RefObject<WorksheetEditorHandle>, title: string) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) { alert('Please allow popups to download as PDF'); return; }
  const editorHtml = editorRef.current?.getHTML?.() || '';
  const printCss = `
    @page { size: A4; margin: 20mm; }
    @media print { html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
    @media screen { body::before { content: "Close this tab after saving your PDF"; display: block; background: #0e363c; color: #f9f9f9; text-align: center; padding: 8px; font-family: system-ui, sans-serif; font-size: 13px; } }
    body { font-family: 'Source Serif 4', Georgia, serif; line-height: 1.7; color: #1a1a1a; max-width: 700px; margin: 0 auto; padding: 2rem; }
    h1 { font-size: 1.8rem; margin-bottom: 1.5rem; } h2, h3 { margin-top: 1.5rem; }
    table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  `;
  const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${printCss}</style>
    <script>window.onload=function(){setTimeout(function(){window.print();},300);}${'<'}/script></head>
    <body><h1>${title}</h1>${editorHtml}</body></html>`;
  printWindow.document.open();
  printWindow.document.write(fullHtml);
  printWindow.document.close();
};

// ─── Summary Button ───
const SummaryButton = ({
  worksheet,
  worksheetContent,
  worksheetTitle,
  worksheetType,
}: {
  worksheet: any;
  worksheetContent: string;
  worksheetTitle: string;
  worksheetType: DocumentType;
}) => {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const existingSummary = (worksheet?.meta as any)?.summary as string | undefined;
  const summaryHtml = useMemo(() => {
    if (!summary) return "";
    let html = marked.parse(summary, { async: false }) as string;
    html = html.replace(
      /\[\[CRM:([^:]*):([^:]*):([^\]]*)\]\]/g,
      (_m, type, id, label) =>
        `<span class="inline-flex max-w-full overflow-hidden items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground align-baseline mx-0.5"><span class="text-muted-foreground shrink-0">[${id}]</span> <span class="truncate min-w-0">${label}</span> <span class="text-muted-foreground font-semibold shrink-0">(${type})</span></span>`
    );
    return html;
  }, [summary]);

  const regenerate = async () => {
    if (!worksheetContent.trim()) return;
    setLoading(true);
    setSummary(null);
    try {
      await generateAndSaveSummary(worksheet.id, worksheetTitle, worksheetContent, worksheetType);
      const updated = await getWorksheet(worksheet.id);
      const newSummary = (updated?.meta as any)?.summary;
      setSummary(newSummary || "Could not generate summary.");
    } catch {
      setSummary("Failed to generate summary.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = async (open: boolean) => {
    if (!open) return;
    if (existingSummary && !summary) { setSummary(existingSummary); return; }
    if (summary) return;
    await regenerate();
  };

  return (
    <Popover onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Summary</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 max-h-80 overflow-y-auto" align="end">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating summary...
          </div>
        ) : summary ? (
          <div>
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm" dangerouslySetInnerHTML={{ __html: summaryHtml }} />
            <div className="mt-2 flex justify-end border-t border-border pt-2">
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground" onClick={regenerate} disabled={loading}>
                <RefreshCw className="h-3 w-3" />
                Regenerate
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No summary available.</p>
        )}
      </PopoverContent>
    </Popover>
  );
};

// ═══════════════════════════════════════════════════════
// WorksheetPage
// ═══════════════════════════════════════════════════════
const WorksheetPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [chatOpen, setChatOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(true);
  const [selectedText, setSelectedText] = useState<string | undefined>();
  const [autoMessage, setAutoMessage] = useState<string | undefined>();
  const [worksheetContent, setWorksheetContent] = useState("");
  const [worksheetTitle, setWorksheetTitle] = useState("");
  const [worksheetType, setWorksheetType] = useState<DocumentType>("note");
  const [designHtml, setDesignHtml] = useState("");
  const [designActive, setDesignActive] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const editorRef = useRef<WorksheetEditorHandle>(null!);
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const tour = useTour("worksheet");

  const handleInsertFileBadge = useCallback((attachment: Attachment) => {
    if (!editorRef.current) return;
    const editor = (editorRef.current as any);
    // Use setContent approach — insert at cursor via the underlying tiptap editor
    // We need access to the tiptap editor instance; for now we use a workaround
    // by exposing insertFileBadge on the handle
    if (typeof editor.insertFileBadge === "function") {
      editor.insertFileBadge(attachment);
    }
  }, []);

  // Toggle logic: at least one of editor/design must stay visible
  const toggleEditor = useCallback(() => {
    if (editorOpen && !designActive) return;
    setEditorOpen((v) => !v);
  }, [editorOpen, designActive]);

  const toggleDesign = useCallback(() => {
    if (designActive && !editorOpen) return;
    setDesignActive((v) => !v);
  }, [designActive, editorOpen]);

  const { data: worksheet, isLoading, error } = useQuery({
    queryKey: ["worksheet", id],
    queryFn: () => getWorksheet(id!),
    enabled: !!id && id !== "new",
    staleTime: 0,
    gcTime: 0,
  });

  const { attachments: rawAttachments } = useWorksheetAttachments(id || "", user?.id);

  const [attachmentInfos, setAttachmentInfos] = useState<Array<{
    id: string; file_name: string; file_type: string; file_size: number;
    title: string; description: string; signed_url: string;
  }>>([]);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      const infos = await Promise.all(
        rawAttachments.map(async (a) => ({
          id: a.id,
          file_name: a.file_name,
          file_type: a.file_type,
          file_size: a.file_size,
          title: a.title,
          description: a.description,
          signed_url: await getSignedUrl(a.file_path).catch(() => ""),
        }))
      );
      if (!cancelled) setAttachmentInfos(infos);
    }
    if (rawAttachments.length > 0) resolve();
    else setAttachmentInfos([]);
    return () => { cancelled = true; };
  }, [rawAttachments]);

  useEffect(() => {
    if (worksheet) {
      if (worksheet.content_md) setWorksheetContent(worksheet.content_md);
      setWorksheetTitle(worksheet.title);
      const docType = (worksheet.document_type as DocumentType) || "note";
      if (docType === "design") {
        setWorksheetType("note");
      } else {
        setWorksheetType(docType);
      }
      const meta = worksheet.meta as Record<string, any> | null;
      if (meta?.design_html) {
        setDesignHtml(meta.design_html);
        setDesignActive(true);
      }
    }
  }, [worksheet]);

  const handleSelectionAI = useCallback((text: string, instruction?: string) => {
    setSelectedText(text);
    setAutoMessage(instruction);
    setChatOpen(true);
  }, []);

  const handleApplyEdit = useCallback((content: string) => {
    if (editorRef.current) editorRef.current.progressiveReveal(content);
  }, []);

  const handleUpdateTitle = useCallback((title: string) => {
    setWorksheetTitle(title);
    editorRef.current?.setTitle(title);
    if (id) {
      updateWorksheet(id, { title }).catch(console.error);
      queryClient.invalidateQueries({ queryKey: ["worksheet", id] });
    }
  }, [id, queryClient]);

  const handleUpdateDocumentType = useCallback((type: DocumentType) => {
    setWorksheetType(type);
    editorRef.current?.setDocumentType(type);
    if (id) {
      updateWorksheet(id, { document_type: type } as any).catch(console.error);
      queryClient.invalidateQueries({ queryKey: ["worksheet", id] });
    }
  }, [id, queryClient]);

  const handleDesignHtmlChange = useCallback((html: string) => {
    setDesignHtml(html);
  }, []);

  if (id === "new") { navigate("/"); return null; }

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error || !worksheet) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">Worksheet not found</p>
        <Button variant="outline" onClick={() => navigate("/")}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to dashboard
        </Button>
      </div>
    );
  }

  const canDownloadEditor = editorOpen && worksheetContent.trim().length > 0;
  const canDownloadDesign = designHtml.length > 0;
  const canDownload = canDownloadEditor || canDownloadDesign;

  const chatPanel = (
    <AIChatPanel
      open={chatOpen}
      onClose={() => setChatOpen(false)}
      selectedText={selectedText}
      autoMessage={autoMessage}
      onAutoMessageConsumed={() => setAutoMessage(undefined)}
      worksheetContent={worksheetContent}
      worksheetTitle={worksheetTitle}
      worksheetType={worksheetType}
      worksheetId={worksheet.id}
      designActive={designActive}
      designHtml={designHtml}
      onDesignHtmlChange={handleDesignHtmlChange}
      onApplyEdit={handleApplyEdit}
      onUpdateTitle={handleUpdateTitle}
      onUpdateDocumentType={handleUpdateDocumentType}
      attachments={attachmentInfos}
    />
  );

  // Count visible content panels for sizing
  const visiblePanels = (editorOpen ? 1 : 0) + (designActive ? 1 : 0);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Header bar */}
      <div className="px-3 sm:px-6 py-3 flex items-center justify-between border-b border-border shrink-0 gap-2">
        <div className="flex items-center gap-1.5 min-w-0 shrink">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1.5 shrink-0">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Back</span>
          </Button>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <Select value={worksheetType} onValueChange={(v) => handleUpdateDocumentType(v as DocumentType)} data-tour="doc-type">
            <SelectTrigger className="w-[90px] sm:w-[120px] h-8 text-xs shrink-0" data-tour="doc-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="note">Note</SelectItem>
              <SelectItem value="skill">Skill</SelectItem>
              <SelectItem value="prompt">Prompt</SelectItem>
              <SelectItem value="template">Template</SelectItem>
            </SelectContent>
          </Select>
          <SummaryButton
            worksheet={worksheet}
            worksheetContent={worksheetContent}
            worksheetTitle={worksheetTitle}
            worksheetType={worksheetType}
          />
          {/* Editor toggle */}
          <Button
            variant={editorOpen ? "secondary" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={toggleEditor}
            disabled={editorOpen && !designActive}
            title={editorOpen && !designActive ? "At least one panel must be visible" : undefined}
          >
            <PenLine className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Editor</span>
          </Button>
          {/* Design toggle */}
          <Button
            variant={designActive ? "secondary" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={toggleDesign}
            disabled={designActive && !editorOpen}
            title={designActive && !editorOpen ? "At least one panel must be visible" : undefined}
          >
            <Paintbrush className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Design</span>
          </Button>
          {/* PDF download */}
          {canDownload && (
            canDownloadEditor && canDownloadDesign ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5" title="Download as PDF">
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">PDF</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openEditorPdf(editorRef, worksheetTitle)}>
                    <PenLine className="h-3.5 w-3.5 mr-2" />
                    Editor content
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openDesignPdf(designHtml)}>
                    <Paintbrush className="h-3.5 w-3.5 mr-2" />
                    Design webpage
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  if (canDownloadDesign) openDesignPdf(designHtml);
                  else openEditorPdf(editorRef, worksheetTitle);
                }}
                title="Download as PDF"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">PDF</span>
              </Button>
            )
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShareOpen(true)}>
            <Share2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Share</span>
          </Button>
          <Button
            variant={chatOpen ? "secondary" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setChatOpen(!chatOpen)}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">AI</span>
          </Button>
        </div>
      </div>

      {/* Main content area: resizable panels */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Content panels (editor + design) */}
          {editorOpen && (
            <ResizablePanel
              defaultSize={designActive ? 50 : (chatOpen ? 70 : 100)}
              minSize={20}
              order={1}
            >
              <div className="h-full overflow-y-auto">
                <div className="mx-auto max-w-[800px] px-3 sm:px-6 py-4 sm:py-8">
                  <WorksheetEditor
                    editorRef={editorRef}
                    worksheetId={worksheet.id}
                    initialTitle={worksheet.title}
                    initialContent={worksheet.content_json}
                    initialDocumentType={(worksheet.document_type as DocumentType) === "design" ? "note" : (worksheet.document_type as DocumentType) || "note"}
                    onSelectionAI={handleSelectionAI}
                    onContentChange={setWorksheetContent}
                    onDocumentTypeChange={handleUpdateDocumentType}
                  />
                </div>
                {user && (
                  <div className="mx-auto max-w-[800px] px-3 sm:px-6 pb-4">
                    <AttachmentPanel
                      worksheetId={worksheet.id}
                      userId={user.id}
                      onInsertBadge={handleInsertFileBadge}
                    />
                  </div>
                )}
              </div>
            </ResizablePanel>
          )}

          {editorOpen && designActive && <ResizableHandle withHandle />}

          {designActive && (
            <ResizablePanel
              defaultSize={editorOpen ? 50 : (chatOpen ? 70 : 100)}
              minSize={20}
              order={2}
            >
              <div className="h-full overflow-hidden p-2">
                <DesignPreview html={designHtml} />
              </div>
            </ResizablePanel>
          )}

          {/* Chat panel */}
          {chatOpen && !isMobile && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel
                defaultSize={30}
                minSize={20}
                maxSize={50}
                order={3}
              >
                {chatPanel}
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>

        {/* Mobile chat as bottom sheet */}
        {isMobile && (
          <Sheet open={chatOpen} onOpenChange={setChatOpen}>
            <SheetContent side="bottom" className="h-[85vh] p-0">
              <SheetTitle className="sr-only">AI Assistant</SheetTitle>
              {chatPanel}
            </SheetContent>
          </Sheet>
        )}
      </div>

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        worksheetId={worksheet.id}
        worksheetTitle={worksheetTitle}
      />
    </div>
  );
};

export default WorksheetPage;
