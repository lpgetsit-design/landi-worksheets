import { useNavigate } from "react-router-dom";
import { Plus, FileText, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

// Mock data — will be replaced with Supabase queries
const mockWorksheets = [
  { id: "1", title: "Meeting Notes — Q1 Review", updated_at: "2026-03-14T10:30:00Z" },
  { id: "2", title: "Product Roadmap Draft", updated_at: "2026-03-13T16:00:00Z" },
  { id: "3", title: "Research: User Interviews", updated_at: "2026-03-12T09:15:00Z" },
];

const Dashboard = () => {
  const navigate = useNavigate();

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Worksheets</h1>
        <Button onClick={() => navigate("/worksheet/new")} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Worksheet
        </Button>
      </div>

      <div className="space-y-2">
        {mockWorksheets.map((ws) => (
          <button
            key={ws.id}
            onClick={() => navigate(`/worksheet/${ws.id}`)}
            className="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-left transition-colors hover:bg-accent"
          >
            <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{ws.title}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatDate(ws.updated_at)}
              </p>
            </div>
          </button>
        ))}
      </div>

      {mockWorksheets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No worksheets yet. Create your first one!</p>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
