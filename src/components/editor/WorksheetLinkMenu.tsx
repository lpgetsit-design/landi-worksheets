import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { useWorksheetSearch, type WorksheetSearchResult } from "@/hooks/useWorksheetSearch";
import { Badge } from "@/components/ui/badge";
import { FileText, Loader2 } from "lucide-react";

export interface WorksheetLinkMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface WorksheetLinkMenuProps {
  query: string;
  command: (attrs: Record<string, unknown>) => void;
  excludeId?: string;
}

const TYPE_LABELS: Record<string, string> = {
  note: "Note",
  skill: "Skill",
  prompt: "Prompt",
  template: "Template",
};

const WorksheetLinkMenu = forwardRef<WorksheetLinkMenuRef, WorksheetLinkMenuProps>(
  ({ query, command, excludeId }, ref) => {
    const { data: results, loading } = useWorksheetSearch(query, true, excludeId);
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [results]);

    const selectResult = useCallback(
      (ws: WorksheetSearchResult) => {
        command({
          worksheetId: ws.id,
          title: ws.title,
        });
      },
      [command],
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelectedIndex((i) => (i <= 0 ? Math.max(results.length - 1, 0) : i - 1));
          return true;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelectedIndex((i) => (i >= results.length - 1 ? 0 : i + 1));
          return true;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          const ws = results[selectedIndex];
          if (ws) selectResult(ws);
          return true;
        }
        return false;
      },
    }));

    return (
      <div className="z-50 w-80 rounded-md border border-border bg-popover shadow-md overflow-hidden">
        <div className="px-3 py-2 border-b border-border flex items-center gap-2">
          <FileText className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Link worksheet:</span>
          <span className="text-sm text-foreground font-medium">
            {query || <span className="text-muted-foreground italic">type to search…</span>}
          </span>
          {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />}
        </div>

        <div className="max-h-[240px] overflow-y-auto">
          {!loading && query.length >= 1 && results.length === 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              No worksheets found
            </div>
          )}

          {!loading && query.length < 1 && (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              Type to search your worksheets
            </div>
          )}

          {results.length > 0 && (
            <div className="p-1">
              {results.map((ws, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <button
                    key={ws.id}
                    onClick={() => selectResult(ws)}
                    className={`w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left outline-none cursor-default ${
                      isSelected ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent/50"
                    }`}
                  >
                    <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                      {TYPE_LABELS[ws.document_type] || ws.document_type}
                    </Badge>
                    <span className="truncate">{ws.title}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  },
);

WorksheetLinkMenu.displayName = "WorksheetLinkMenu";

export default WorksheetLinkMenu;
