import { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { MessageSquare, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import WorksheetEditor from "@/components/editor/WorksheetEditor";
import AIChatPanel from "@/components/chat/AIChatPanel";

const WorksheetPage = () => {
  const { id } = useParams();
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedText, setSelectedText] = useState<string | undefined>();

  const handleSelectionAI = useCallback((text: string) => {
    setSelectedText(text);
    setChatOpen(true);
  }, []);

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Editor Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[800px] px-6 py-8">
          <div className="mb-4 flex items-center justify-end gap-2">
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
          <WorksheetEditor onSelectionAI={handleSelectionAI} />
        </div>
      </div>

      {/* AI Chat Panel */}
      <AIChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        selectedText={selectedText}
      />
    </div>
  );
};

export default WorksheetPage;
