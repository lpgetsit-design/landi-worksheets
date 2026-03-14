import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { useBullhornSearch, type BullhornEntity } from "@/hooks/useBullhornSearch";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
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
  command: (attrs: Record<string, unknown>) => void;
}

const SlashCommandMenu = forwardRef<SlashCommandMenuRef, SlashCommandMenuProps>(
  ({ command }, ref) => {
    const [searchQuery, setSearchQuery] = useState("");
    const { data: results, loading } = useBullhornSearch(searchQuery, true);
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [results]);

    const selectResult = useCallback(
      (entity: BullhornEntity) => {
        const label = getEntityLabel(entity);
        command({
          entityType: entity.entityType,
          entityId: getEntityId(entity),
          label,
          metadata: entity,
        });
      },
      [command]
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((i) => (i <= 0 ? Math.max(results.length - 1, 0) : i - 1));
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((i) => (i >= results.length - 1 ? 0 : i + 1));
          return true;
        }
        if (event.key === "Enter") {
          const entity = results[selectedIndex];
          if (entity) selectResult(entity);
          return true;
        }
        return false;
      },
    }));

    return (
      <div className="z-50 w-80 rounded-md border border-border bg-popover shadow-md">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search Bullhorn..."
            value={searchQuery}
            onValueChange={setSearchQuery}
            autoFocus
          />
          <CommandList>
            {loading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {!loading && searchQuery.length >= 2 && results.length === 0 && (
              <CommandEmpty>No results found.</CommandEmpty>
            )}

            {!loading && searchQuery.length < 2 && (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                Type at least 2 characters to search
              </div>
            )}

            {!loading && results.length > 0 && (
              <CommandGroup heading="Results">
                {results.map((entity, index) => {
                  const eid = getEntityId(entity);
                  return (
                    <CommandItem
                      key={`${entity.entityType}-${eid}-${index}`}
                      onSelect={() => selectResult(entity)}
                      data-selected={index === selectedIndex}
                      className="flex items-center gap-2"
                      value={`${entity.entityType}-${eid}-${getEntityLabel(entity)}`}
                    >
                      <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                        {ENTITY_SHORT[entity.entityType] || entity.entityType}
                      </Badge>
                      <span className="text-muted-foreground text-xs">[{eid}]</span>
                      <span className="truncate">{getEntityLabel(entity)}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </div>
    );
  }
);

SlashCommandMenu.displayName = "SlashCommandMenu";

export default SlashCommandMenu;
