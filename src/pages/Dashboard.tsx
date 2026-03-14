import { useNavigate } from "react-router-dom";
import { Plus, FileText, Clock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/AuthProvider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getWorksheets, createWorksheet, deleteWorksheet } from "@/lib/worksheets";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/AuthProvider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getWorksheets, createWorksheet, deleteWorksheet } from "@/lib/worksheets";

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: worksheets = [], isLoading } = useQuery({
    queryKey: ["worksheets"],
    queryFn: getWorksheets,
  });

  const createMutation = useMutation({
    mutationFn: () => createWorksheet(user!.id),
    onSuccess: (ws) => {
      queryClient.invalidateQueries({ queryKey: ["worksheets"] });
      navigate(`/worksheet/${ws.id}`);
    },
    onError: (err: any) => {
      console.error("Create worksheet error:", err);
      toast.error("Failed to create worksheet: " + err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWorksheet,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["worksheets"] }),
  });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Worksheets</h1>
        <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Worksheet
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-muted" />
          ))}
        </div>
      ) : worksheets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No worksheets yet. Create your first one!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {worksheets.map((ws) => (
            <div
              key={ws.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 transition-colors hover:bg-accent"
            >
              <button
                onClick={() => navigate(`/worksheet/${ws.id}`)}
                className="flex flex-1 items-center gap-3 text-left"
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
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteMutation.mutate(ws.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
