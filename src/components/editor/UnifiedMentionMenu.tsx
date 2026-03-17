import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import { useBullhornSearch, type BullhornEntity } from "@/hooks/useBullhornSearch";
import { useWorksheetSearch, type WorksheetSearchResult } from "@/hooks/useWorksheetSearch";
import { Badge } from "@/components/ui/badge";
import { FileText, Briefcase, Loader2, ArrowLeft } from "lucide-react";

export interface UnifiedMentionMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface UnifiedMentionMenuProps {
  query: string;
  command: (attrs: Record<string, unknown>) => void;
  excludeWorksheetId?: string;
}

type Mode = "pick" | "crm" | "worksheet";

const CATEGORY_ITEMS = [
  { key: "crm" as const, label: "Search CRM", icon: Briefcase, description: "Find candidates, contacts, jobs…" },
  { key: "worksheet" as const, label: "Link Worksheet", icon: FileText, description: "Link to another worksheet" },
];

function getEntityLabel(entity: BullhornEntity): string {
  return (entity.title as string) || `${entity.entityType} #${entity.entityId}`;
}

function getEntityId(entity: BullhornEntity): number {
  return (entity.entityId as number) ?? (entity.id as number);
}

const ENTITY_SHORT: Record<string, string> = {
  Candidate: "Candidate",
  ClientContact: "Contact",
  ClientCorporation: "Client",
  JobOrder: "Job",
};

const TYPE_LABELS: Record<string, string> = {
  note: "Note",
  skill: "Skill",
  prompt: "Prompt",
  template: "Template",
};

const UnifiedMentionMenu = forwardRef<UnifiedMentionMenuRef, UnifiedMentionMenuProps>(
  ({ query, command, excludeWorksheetId }, ref) => {
    const [mode, setMode] = useState<Mode>("pick");
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Search hooks — only active when in respective mode
    const { data: crmResults, loading: crmLoading } = useBullhornSearch(query, mode === "crm");
    const { data: wsResults, loading: wsLoading } = useWorksheetSearch(query, mode === "worksheet", excludeWorksheetId);

    // Reset selection when results change
    useEffect(() => { setSelectedIndex(0); }, [crmResults, wsResults, mode]);

    const selectCrm = useCallback((entity: BullhornEntity) => {
      command({
        _type: "crm",
        entityType: entity.entityType,
        entityId: getEntityId(entity),
        label: getEntityLabel(entity),
        metadata: entity,
      });
    }, [command]);

    const selectWorksheet = useCallback((ws: WorksheetSearchResult) => {
      command({
        _type: "worksheet",
        worksheetId: ws.id,
        title: ws.title,
      });
    }, [command]);

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          if (mode !== "pick") {
            setMode("pick");
            setSelectedIndex(0);
            return true;
          }
          return false; // let extension handle dismiss
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          const len = currentListLength();
          setSelectedIndex((i) => (i <= 0 ? Math.max(len - 1, 0) : i - 1));
          return true;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          const len = currentListLength();
          setSelectedIndex((i) => (i >= len - 1 ? 0 : i + 1));
          return true;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          handleSelect(selectedIndex);
          return true;
        }

        // Backspace in search mode with empty query goes back to picker
        if (event.key === "Backspace" && mode !== "pick" && query === "") {
          setMode("pick");
          setSelectedIndex(0);
          return true;
        }

        return false;
      },
    }));

    function currentListLength() {
      if (mode === "pick") return CATEGORY_ITEMS.length;
      if (mode === "crm") return crmResults.length;
      return wsResults.length;
    }

    function handleSelect(index: number) {
      if (mode === "pick") {
        const cat = CATEGORY_ITEMS[index];
        if (cat) setMode(cat.key);
        return;
      }
      if (mode === "crm") {
        const entity = crmResults[index];
        if (entity) selectCrm(entity);
        return;
      }
      const ws = wsResults[index];
      if (ws) selectWorksheet(ws);
    }

    const loading = mode === "crm" ? crmLoading : mode === "worksheet" ? wsLoading : false;
    const minChars = mode === "crm" ? 2 : 1;

    return (
      <div className="z-50 w-80 rounded-md border border-border bg-popover shadow-md overflow-hidden">
        {/* Header */}
        <div className="px-3 py-2 border-b border-border flex items-center gap-2">
          {mode !== "pick" && (
            <button
              onClick={() => { setMode("pick"); setSelectedIndex(0); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
            </button>
          )}
          <span className="text-xs text-muted-foreground">
            {mode === "pick" ? "Mention:" : mode === "crm" ? "Search CRM:" : "Link worksheet:"}
          </span>
          {mode !== "pick" && (
            <span className="text-sm text-foreground font-medium">
              {query || <span className="text-muted-foreground italic">type to search…</span>}
            </span>
          )}
          {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />}
        </div>

        {/* Body */}
        <div className="max-h-[240px] overflow-y-auto">
          {/* Category picker */}
          {mode === "pick" && (
            <div className="p-1">
              {CATEGORY_ITEMS.map((cat, index) => {
                const Icon = cat.icon;
                const isSelected = index === selectedIndex;
                return (
                  <button
                    key={cat.key}
                    onClick={() => { setMode(cat.key); setSelectedIndex(0); }}
                    className={`w-full flex items-center gap-3 rounded-sm px-2 py-2 text-sm text-left outline-none cursor-default ${
                      isSelected ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent/50"
                    }`}
                  >
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <div className="font-medium">{cat.label}</div>
                      <div className="text-xs text-muted-foreground">{cat.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* CRM results */}
          {mode === "crm" && (
            <>
              {!crmLoading && query.length >= minChars && crmResults.length === 0 && (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">No CRM results found</div>
              )}
              {!crmLoading && query.length < minChars && (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">Type at least 2 characters to search</div>
              )}
              {crmResults.length > 0 && (
                <div className="p-1">
                  {crmResults.map((entity, index) => {
                    const eid = getEntityId(entity);
                    const isSelected = index === selectedIndex;
                    return (
                      <button
                        key={`${entity.entityType}-${eid}-${index}`}
                        onClick={() => selectCrm(entity)}
                        className={`w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left outline-none cursor-default ${
                          isSelected ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent/50"
                        }`}
                      >
                        <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                          {ENTITY_SHORT[entity.entityType] || entity.entityType}
                        </Badge>
                        <span className="text-muted-foreground text-xs">[{eid}]</span>
                        <span className="truncate">{getEntityLabel(entity)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Worksheet results */}
          {mode === "worksheet" && (
            <>
              {!wsLoading && query.length >= minChars && wsResults.length === 0 && (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">No worksheets found</div>
              )}
              {!wsLoading && query.length < minChars && (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">Type to search your worksheets</div>
              )}
              {wsResults.length > 0 && (
                <div className="p-1">
                  {wsResults.map((ws, index) => {
                    const isSelected = index === selectedIndex;
                    return (
                      <button
                        key={ws.id}
                        onClick={() => selectWorksheet(ws)}
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
            </>
          )}
        </div>
      </div>
    );
  },
);

UnifiedMentionMenu.displayName = "UnifiedMentionMenu";

export default UnifiedMentionMenu;
