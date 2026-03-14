import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MessageSquare, Share2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import WorksheetEditor from "@/components/editor/WorksheetEditor";
import AIChatPanel from "@/components/chat/AIChatPanel";
import { useQuery } from "@tanstack/react-query";
import { getWorksheet } from "@/lib/worksheets";

const WorksheetPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedText, setSelectedText] = useState<string | undefined>();

  const { data: worksheet, isLoading, error } = useQuery({
    queryKey: ["worksheet", id],
    queryFn: () => getWorksheet(id!),
    enabled: !!id && id !== "new",
  });

  const handleSelectionAI = useCallback((text: string) => {
    setSelectedText(text);
    setChatOpen(true);
  }, []);

  if (id === "new") {
    // New worksheet creation is handled by Dashboard's createMutation
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
            worksheetId={worksheet.id}
            initialTitle={worksheet.title}
            initialContent={worksheet.content_json}
            onSelectionAI={handleSelectionAI}
          />
        </div>
      </div>

      <AIChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        selectedText={selectedText}
      />
    </div>
  );
};

export default WorksheetPage;
