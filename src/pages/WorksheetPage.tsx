import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MessageSquare, Share2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import WorksheetEditor from "@/components/editor/WorksheetEditor";
import type { WorksheetEditorHandle } from "@/components/editor/WorksheetEditor";
import AIChatPanel from "@/components/chat/AIChatPanel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getWorksheet, updateWorksheet } from "@/lib/worksheets";
import type { DocumentType } from "@/lib/worksheets";
import { marked } from "marked";

const WorksheetPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedText, setSelectedText] = useState<string | undefined>();
  const [worksheetContent, setWorksheetContent] = useState("");
  const [worksheetTitle, setWorksheetTitle] = useState("");
  const [worksheetType, setWorksheetType] = useState<DocumentType>("note");
  const editorRef = useRef<WorksheetEditorHandle>(null!);

  const { data: worksheet, isLoading, error } = useQuery({
    queryKey: ["worksheet", id],
    queryFn: () => getWorksheet(id!),
    enabled: !!id && id !== "new",
  });

  useEffect(() => {
    if (worksheet) {
      if (worksheet.content_md) setWorksheetContent(worksheet.content_md);
      setWorksheetTitle(worksheet.title);
      setWorksheetType((worksheet.document_type as DocumentType) || "note");
    }
  }, [worksheet]);

  const handleSelectionAI = useCallback((text: string) => {
    setSelectedText(text);
    setChatOpen(true);
  }, []);

  const handleApplyEdit = useCallback((content: string) => {
    if (editorRef.current) {
      let html = marked.parse(content, { async: false }) as string;
      // Restore CRM badge placeholders [[CRM:entityType:entityId:label]] back into badge HTML
      html = html.replace(
        /\[\[CRM:([^:]+):([^:]+):([^\]]+)\]\]/g,
        (_match, entityType, entityId, label) => {
          const ENTITY_SHORT: Record<string, string> = {
            Candidate: "Candidate",
            ClientContact: "Contact",
            ClientCorporation: "Client",
            JobOrder: "Job",
          };
          const typeLabel = ENTITY_SHORT[entityType] || entityType;
          return `<span data-crm-badge="" entitytype="${entityType}" entityid="${entityId}" label="${label}" data-entity-type="${entityType}" data-entity-id="${entityId}" class="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground align-baseline mx-0.5 select-none" contenteditable="false"><span class="text-muted-foreground">[${entityId}] </span><span>${label} </span><span class="text-muted-foreground font-semibold">(${typeLabel})</span></span>`;
        }
      );
      editorRef.current.setContent(html);
    }
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

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[800px] px-6 py-8">
          <div className="mb-4 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Share2 className="h-3.5 w-3.5" />
                Share
              </Button>
              <Button
                variant={chatOpen ? "secondary" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => setChatOpen(!chatOpen)}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                AI
              </Button>
            </div>
          </div>
          <WorksheetEditor
            editorRef={editorRef}
            worksheetId={worksheet.id}
            initialTitle={worksheet.title}
            initialContent={worksheet.content_json}
            initialDocumentType={(worksheet.document_type as DocumentType) || "note"}
            onSelectionAI={handleSelectionAI}
            onContentChange={setWorksheetContent}
          />
        </div>
      </div>

      <AIChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        selectedText={selectedText}
        worksheetContent={worksheetContent}
        worksheetTitle={worksheetTitle}
        worksheetType={worksheetType}
        onApplyEdit={handleApplyEdit}
        onUpdateTitle={handleUpdateTitle}
        onUpdateDocumentType={handleUpdateDocumentType}
      />
    </div>
  );
};

export default WorksheetPage;
