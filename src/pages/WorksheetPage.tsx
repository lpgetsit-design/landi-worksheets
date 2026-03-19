import { useState, useCallback, useEffect, useRef, useMemo, MouseEvent as ReactMouseEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MessageSquare, ArrowLeft, FileText, Loader2, RefreshCw, Download, Share2 } from "lucide-react";
import ShareDialog from "@/components/share/ShareDialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import WorksheetEditor from "@/components/editor/WorksheetEditor";
import type { WorksheetEditorHandle } from "@/components/editor/WorksheetEditor";
import AIChatPanel from "@/components/chat/AIChatPanel";
import DesignPreview from "@/components/design/DesignPreview";
import DesignChatPanel from "@/components/design/DesignChatPanel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getWorksheet, updateWorksheet, generateAndSaveSummary } from "@/lib/worksheets";
import type { DocumentType } from "@/lib/worksheets";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { marked } from "marked";

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
    if (existingSummary && !summary) {
      setSummary(existingSummary);
      return;
    }
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

const WorksheetPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedText, setSelectedText] = useState<string | undefined>();
  const [autoMessage, setAutoMessage] = useState<string | undefined>();
  const [worksheetContent, setWorksheetContent] = useState("");
  const [worksheetTitle, setWorksheetTitle] = useState("");
  const [worksheetType, setWorksheetType] = useState<DocumentType>("note");
  const [designHtml, setDesignHtml] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const editorRef = useRef<WorksheetEditorHandle>(null!);
  const isMobile = useIsMobile();

  // Resizable chat panel
  const [chatWidth, setChatWidth] = useState(350);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isDesignMode = worksheetType === "design";

  const handleDragStart = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (ev: globalThis.MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const maxWidth = containerRect.width * 0.5;
      const newWidth = Math.max(300, Math.min(maxWidth, containerRect.right - ev.clientX));
      setChatWidth(newWidth);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  const { data: worksheet, isLoading, error } = useQuery({
    queryKey: ["worksheet", id],
    queryFn: () => getWorksheet(id!),
    enabled: !!id && id !== "new",
    staleTime: 0,
    gcTime: 0,
  });

  useEffect(() => {
    if (worksheet) {
      if (worksheet.content_md) setWorksheetContent(worksheet.content_md);
      setWorksheetTitle(worksheet.title);
      const docType = (worksheet.document_type as DocumentType) || "note";
      setWorksheetType(docType);
      const meta = worksheet.meta as Record<string, any> | null;
      if (meta?.design_html) setDesignHtml(meta.design_html);
      if (docType === "design") setChatOpen(true);
    }
  }, [worksheet]);

  const handleSelectionAI = useCallback((text: string, instruction?: string) => {
    setSelectedText(text);
    setAutoMessage(instruction);
    setChatOpen(true);
  }, []);

  const handleApplyEdit = useCallback((content: string) => {
    if (editorRef.current) {
      editorRef.current.progressiveReveal(content);
    }
  }, []);

  const handleUpdateTitle = useCallback((title: string) => {
    setWorksheetTitle(title);
    if (!isDesignMode) editorRef.current?.setTitle(title);
    if (id) {
      updateWorksheet(id, { title }).catch(console.error);
      queryClient.invalidateQueries({ queryKey: ["worksheet", id] });
    }
  }, [id, queryClient, isDesignMode]);

  const handleUpdateDocumentType = useCallback((type: DocumentType) => {
    setWorksheetType(type);
    if (type !== "design") editorRef.current?.setDocumentType(type);
    if (id) {
      updateWorksheet(id, { document_type: type } as any).catch(console.error);
      queryClient.invalidateQueries({ queryKey: ["worksheet", id] });
    }
  }, [id, queryClient]);

  if (id === "new") {
    navigate("/");
    return null;
  }

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


  const chatPanel = isDesignMode ? (
    <DesignChatPanel
      open={true}
      onClose={() => setChatOpen(false)}
      worksheetId={worksheet.id}
      worksheetTitle={worksheetTitle}
      currentHtml={designHtml}
      onHtmlChange={setDesignHtml}
      onUpdateTitle={handleUpdateTitle}
    />
  ) : (
    <AIChatPanel
      open={chatOpen}
      onClose={() => setChatOpen(false)}
      selectedText={selectedText}
      autoMessage={autoMessage}
      onAutoMessageConsumed={() => setAutoMessage(undefined)}
      worksheetContent={worksheetContent}
      worksheetTitle={worksheetTitle}
      worksheetType={worksheetType}
      onApplyEdit={handleApplyEdit}
      onUpdateTitle={handleUpdateTitle}
      onUpdateDocumentType={handleUpdateDocumentType}
    />
  );

  return (
    <div ref={containerRef} className="flex h-[calc(100vh-3.5rem)]">
      {/* Main content area */}
      <div className="flex-1 overflow-hidden min-w-0 flex flex-col">
        {/* Header bar */}
        <div className="px-3 sm:px-6 py-3 flex items-center justify-between border-b border-border shrink-0 gap-2">
          <div className="flex items-center gap-1.5 min-w-0 shrink">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1.5 shrink-0">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Back</span>
            </Button>
            {isDesignMode && (
              <input
                type="text"
                value={worksheetTitle}
                onChange={(e) => setWorksheetTitle(e.target.value)}
                onBlur={() => {
                  if (id) {
                    updateWorksheet(id, { title: worksheetTitle }).catch(console.error);
                    queryClient.invalidateQueries({ queryKey: ["worksheet", id] });
                  }
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground border-none outline-none focus:ring-0 placeholder:text-muted-foreground truncate"
                placeholder="Untitled"
              />
            )}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Select value={worksheetType} onValueChange={(v) => handleUpdateDocumentType(v as DocumentType)} disabled={worksheetType === "design" && !!designHtml}>
              <SelectTrigger className="w-[90px] sm:w-[120px] h-8 text-xs shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="note">Note</SelectItem>
                <SelectItem value="skill">Skill</SelectItem>
                <SelectItem value="prompt">Prompt</SelectItem>
                <SelectItem value="template">Template</SelectItem>
                <SelectItem value="design">Design</SelectItem>
              </SelectContent>
            </Select>
            {!isDesignMode && (
              <SummaryButton
                worksheet={worksheet}
                worksheetContent={worksheetContent}
                worksheetTitle={worksheetTitle}
                worksheetType={worksheetType}
              />
            )}
            {isDesignMode && designHtml && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  const printWindow = window.open('', '_blank');
                  if (!printWindow) {
                    alert('Please allow popups to download as PDF');
                    return;
                  }
                  // Strict @page rules for consistent sizing/margins across browsers
                  const printCss = `
                    @page {
                      size: A4;
                      margin: 0;
                    }
                    @media print {
                      html, body {
                        width: 210mm;
                        min-height: 297mm;
                        margin: 0 !important;
                        padding: 0 !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                        color-adjust: exact !important;
                      }
                      /* Remove any box-shadow that creates weird edges */
                      * {
                        box-shadow: none !important;
                      }
                      /* Ensure container fills the page cleanly */
                      .container, [class*="container"] {
                        max-width: 100% !important;
                        margin: 0 !important;
                        border-radius: 0 !important;
                        box-shadow: none !important;
                      }
                    }
                    @media screen {
                      body::before {
                        content: "Close this tab after saving your PDF";
                        display: block;
                        background: #0e363c;
                        color: #f9f9f9;
                        text-align: center;
                        padding: 8px;
                        font-family: system-ui, sans-serif;
                        font-size: 13px;
                      }
                    }
                  `;
                  const printHtml = designHtml.replace(
                    '</head>',
                    `<style>${printCss}</style>
                    <script>
                      window.onload = function() {
                        // Wait for fonts to load before printing
                        document.fonts.ready.then(function() {
                          setTimeout(function() { window.print(); }, 300);
                        });
                      };
                    </script>
                    </head>`
                  );
                  printWindow.document.open();
                  printWindow.document.write(printHtml);
                  printWindow.document.close();
                }}
                title="Download as PDF"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">PDF</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShareOpen(true)}
            >
              <Share2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Share</span>
            </Button>
            <Button
              variant={chatOpen || isDesignMode ? "secondary" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => setChatOpen(!chatOpen)}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">AI</span>
            </Button>
          </div>
        </div>

        {/* Content */}
        {isDesignMode ? (
          <div className="flex-1 overflow-hidden p-2">
            <DesignPreview html={designHtml} />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[800px] px-3 sm:px-6 py-4 sm:py-8">
              <WorksheetEditor
                editorRef={editorRef}
                worksheetId={worksheet.id}
                initialTitle={worksheet.title}
                initialContent={worksheet.content_json}
                initialDocumentType={(worksheet.document_type as DocumentType) || "note"}
                onSelectionAI={handleSelectionAI}
                onContentChange={setWorksheetContent}
                onDocumentTypeChange={handleUpdateDocumentType}
              />
            </div>
          </div>
        )}
      </div>

      {/* Chat panel */}
      {isMobile ? (
        <Sheet open={chatOpen} onOpenChange={setChatOpen}>
          <SheetContent side="bottom" className="h-[85vh] p-0">
            <SheetTitle className="sr-only">AI Assistant</SheetTitle>
            {chatPanel}
          </SheetContent>
        </Sheet>
      ) : (
        (chatOpen || isDesignMode) && (
          <div className="relative flex-shrink-0" style={{ width: chatWidth }}>
            <div
              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-primary/20 active:bg-primary/30 transition-colors"
              onMouseDown={handleDragStart}
            />
            {chatPanel}
          </div>
        )
      )}

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
