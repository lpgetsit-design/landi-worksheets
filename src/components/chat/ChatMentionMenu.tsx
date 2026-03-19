import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import { useBullhornSearch, type BullhornEntity } from "@/hooks/useBullhornSearch";
import { useWorksheetSearch, type WorksheetSearchResult } from "@/hooks/useWorksheetSearch";
import { Badge } from "@/components/ui/badge";
import { FileText, Briefcase, Loader2, ArrowLeft } from "lucide-react";

export interface MentionItem {
  type: "crm" | "worksheet";
  label: string;
  // CRM fields
  entityType?: string;
  entityId?: number;
  // Worksheet fields
  worksheetId?: string;
  worksheetTitle?: string;
  documentType?: string;
}

export interface ChatMentionMenuRef {
  onKeyDown: (event: React.KeyboardEvent) => boolean;
}

interface ChatMentionMenuProps {
  query: string;
  onSelect: (item: MentionItem) => void;
  onClose: () => void;
  excludeWorksheetId?: string;
}

type Mode = "pick" | "crm" | "worksheet";

const CATEGORY_ITEMS = [
  { key: "crm" as const, label: "Search CRM", icon: Briefcase, description: "Find candidates, contacts, jobs…" },
  { key: "worksheet" as const, label: "Link Worksheet", icon: FileText, description: "Reference another worksheet" },
];

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
  design: "Design",
};

function getEntityLabel(entity: BullhornEntity): string {
  return (entity.title as string) || `${entity.entityType} #${entity.id}`;
}

function getEntityId(entity: BullhornEntity): number {
  return (entity.entityId as number) ?? (entity.id as number);
}

const ChatMentionMenu = forwardRef<ChatMentionMenuRef, ChatMentionMenuProps>(
  ({ query, onSelect, onClose, excludeWorksheetId }, ref) => {
    const [mode, setMode] = useState<Mode>("pick");
    const [selectedIndex, setSelectedIndex] = useState(0);

    const { data: crmResults, loading: crmLoading } = useBullhornSearch(query, mode === "crm");
    const { data: wsResults, loading: wsLoading, hasMore: wsHasMore, loadMore: wsLoadMore } = useWorksheetSearch(query, mode === "worksheet", excludeWorksheetId);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => { setSelectedIndex(0); }, [crmResults, wsResults, mode]);

    // Reset mode when menu opens fresh (query resets)
    useEffect(() => {
      if (query === "") setMode("pick");
    }, [query]);

    const selectCrm = useCallback((entity: BullhornEntity) => {
      onSelect({
        type: "crm",
        label: getEntityLabel(entity),
        entityType: entity.entityType,
        entityId: getEntityId(entity),
      });
    }, [onSelect]);

    const selectWorksheet = useCallback((ws: WorksheetSearchResult) => {
      onSelect({
        type: "worksheet",
        label: ws.title,
        worksheetId: ws.id,
        worksheetTitle: ws.title,
        documentType: ws.document_type,
      });
    }, [onSelect]);

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

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === "Escape") {
          if (mode !== "pick") {
            setMode("pick");
            setSelectedIndex(0);
            return true;
          }
          onClose();
          return true;
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

        if (event.key === "Backspace" && mode !== "pick" && query === "") {
          setMode("pick");
          setSelectedIndex(0);
          return true;
        }

        return false;
      },
    }));

    const loading = mode === "crm" ? crmLoading : mode === "worksheet" ? wsLoading : false;
    const minChars = mode === "crm" ? 2 : 1;

    return (
      <div className="z-50 w-72 rounded-md border border-border bg-popover shadow-lg overflow-hidden">
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
          {mode !== "pick" && query && (
            <span className="text-xs text-foreground font-medium truncate">{query}</span>
          )}
          {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />}
        </div>

        {/* Body */}
        <div
          className="max-h-[200px] overflow-y-auto"
          ref={scrollRef}
          onScroll={(e) => {
            if (mode !== "worksheet") return;
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20 && wsHasMore && !wsLoading) {
              wsLoadMore();
            }
          }}
        >
          {mode === "pick" && (
            <div className="p-1">
              {CATEGORY_ITEMS.map((cat, index) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.key}
                    onClick={() => { setMode(cat.key); setSelectedIndex(0); }}
                    className={`w-full flex items-center gap-3 rounded-sm px-2 py-2 text-sm text-left outline-none cursor-default ${
                      index === selectedIndex ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent/50"
                    }`}
                  >
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <div className="font-medium text-xs">{cat.label}</div>
                      <div className="text-[10px] text-muted-foreground">{cat.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {mode === "crm" && (
            <>
              {!crmLoading && query.length >= minChars && crmResults.length === 0 && (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">No CRM results</div>
              )}
              {!crmLoading && query.length < minChars && (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">Type at least 2 characters</div>
              )}
              {crmResults.length > 0 && (
                <div className="p-1">
                  {crmResults.map((entity, index) => {
                    const eid = getEntityId(entity);
                    return (
                      <button
                        key={`${entity.entityType}-${eid}-${index}`}
                        onClick={() => selectCrm(entity)}
                        className={`w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-left outline-none cursor-default ${
                          index === selectedIndex ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent/50"
                        }`}
                      >
                        <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                          {ENTITY_SHORT[entity.entityType] || entity.entityType}
                        </Badge>
                        <span className="truncate">{getEntityLabel(entity)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {mode === "worksheet" && (
            <>
              {!wsLoading && wsResults.length === 0 && query.length > 0 && (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">No worksheets found</div>
              )}
              {wsResults.length > 0 && (
                <div className="p-1">
                  {wsResults.map((ws, index) => (
                    <button
                      key={ws.id}
                      onClick={() => selectWorksheet(ws)}
                      className={`w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-left outline-none cursor-default ${
                        index === selectedIndex ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent/50"
                      }`}
                    >
                      <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                        {TYPE_LABELS[ws.document_type] || ws.document_type}
                      </Badge>
                      <span className="truncate">{ws.title}</span>
                    </button>
                  ))}
                  {wsLoading && (
                    <div className="flex justify-center py-2">
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              )}
              {wsResults.length === 0 && wsLoading && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  },
);

ChatMentionMenu.displayName = "ChatMentionMenu";

export default ChatMentionMenu;
