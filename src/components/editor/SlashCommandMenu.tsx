import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { useBullhornSearch, type BullhornEntity } from "@/hooks/useBullhornSearch";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

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

export interface SlashCommandMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface SlashCommandMenuProps {
  query: string;
  command: (attrs: Record<string, unknown>) => void;
}

const SlashCommandMenu = forwardRef<SlashCommandMenuRef, SlashCommandMenuProps>(
  ({ query, command }, ref) => {
    const { data: results, loading } = useBullhornSearch(query, true);
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [results]);

    const selectResult = useCallback(
      (entity: BullhornEntity) => {
        command({
          entityType: entity.entityType,
          entityId: getEntityId(entity),
          label: getEntityLabel(entity),
          metadata: entity,
        });
      },
      [command]
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
          const entity = results[selectedIndex];
          if (entity) selectResult(entity);
          return true;
        }
        return false;
      },
    }));

    return (
      <div className="z-50 w-80 rounded-md border border-border bg-popover shadow-md overflow-hidden">
        {/* Query indicator */}
        <div className="px-3 py-2 border-b border-border flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Search:</span>
          <span className="text-sm text-foreground font-medium">
            {query || <span className="text-muted-foreground italic">type to search…</span>}
          </span>
          {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />}
        </div>

        {/* Results */}
        <div className="max-h-[240px] overflow-y-auto">
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              No results found
            </div>
          )}

          {!loading && query.length < 2 && (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              Type at least 2 characters to search
            </div>
          )}

          {results.length > 0 && (
            <div className="p-1">
              {results.map((entity, index) => {
                const eid = getEntityId(entity);
                const isSelected = index === selectedIndex;
                return (
                  <button
                    key={`${entity.entityType}-${eid}-${index}`}
                    onClick={() => selectResult(entity)}
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
        </div>
      </div>
    );
  }
);

SlashCommandMenu.displayName = "SlashCommandMenu";

export default SlashCommandMenu;
