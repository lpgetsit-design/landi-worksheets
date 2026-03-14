import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { useBullhornSearch, type BullhornEntity } from "@/hooks/useBullhornSearch";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Loader2, User, Building2, Briefcase, Contact } from "lucide-react";

const ENTITY_TYPES = [
  { value: "Candidate", label: "Candidate", icon: User },
  { value: "ClientContact", label: "Client Contact", icon: Contact },
  { value: "ClientCorporation", label: "Client Corporation", icon: Building2 },
  { value: "JobOrder", label: "Job Order", icon: Briefcase },
] as const;

function getEntityLabel(entity: BullhornEntity): string {
  // FastFind returns: { entityType, entityId, title, byLine, location }
  // "title" is the display name for all entity types
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
    const [phase, setPhase] = useState<"pick" | "search">("pick");
    const [selectedType, setSelectedType] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const { data: results, loading } = useBullhornSearch(searchQuery, phase === "search");
    const [selectedIndex, setSelectedIndex] = useState(0);

    const items = phase === "pick" ? ENTITY_TYPES : results;

    useEffect(() => {
      setSelectedIndex(0);
    }, [phase, results]);

    const selectEntityType = useCallback(
      (type: string) => {
        setSelectedType(type);
        setPhase("search");
        setSearchQuery("");
      },
      []
    );

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
          setSelectedIndex((i) => (i <= 0 ? (Array.isArray(items) ? items.length - 1 : 0) : i - 1));
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((i) =>
            Array.isArray(items) ? (i >= items.length - 1 ? 0 : i + 1) : 0
          );
          return true;
        }
        if (event.key === "Enter") {
          if (phase === "pick") {
            const item = ENTITY_TYPES[selectedIndex];
            if (item) selectEntityType(item.value);
          } else {
            const entity = results[selectedIndex];
            if (entity) selectResult(entity);
          }
          return true;
        }
        if (event.key === "Escape") {
          if (phase === "search") {
            setPhase("pick");
            setSelectedType(null);
            return true;
          }
          return false;
        }
        return false;
      },
    }));

    return (
      <div className="z-50 w-72 rounded-md border border-border bg-popover shadow-md">
        <Command shouldFilter={false}>
          {phase === "search" && (
            <CommandInput
              placeholder={`Search ${selectedType}...`}
              value={searchQuery}
              onValueChange={setSearchQuery}
              autoFocus
            />
          )}
          <CommandList>
            {phase === "pick" && (
              <CommandGroup heading="Insert CRM Entity">
                {ENTITY_TYPES.map((type, index) => {
                  const Icon = type.icon;
                  return (
                    <CommandItem
                      key={type.value}
                      onSelect={() => selectEntityType(type.value)}
                      data-selected={index === selectedIndex}
                      className="flex items-center gap-2"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {type.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {phase === "search" && loading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {phase === "search" && !loading && searchQuery.length >= 2 && results.length === 0 && (
              <CommandEmpty>No results found.</CommandEmpty>
            )}

            {phase === "search" && !loading && results.length > 0 && (
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
                ))}
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
