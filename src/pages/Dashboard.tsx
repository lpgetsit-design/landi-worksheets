import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FileText, Clock, Trash2, ArrowUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useAuth } from "@/components/AuthProvider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getWorksheets, createWorksheet, deleteWorksheet, getWorksheetEntities } from "@/lib/worksheets";
import { toast } from "sonner";

type SortField = "updated_at" | "created_at";
type SortDir = "desc" | "asc";
type TypeFilter = "all" | "note" | "skill" | "prompt" | "template";

interface EntityOption {
  entity_type: string;
  entity_id: string;
  label: string;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [sortField, setSortField] = useState<SortField>("updated_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [entityFilters, setEntityFilters] = useState<EntityOption[]>([]);
  const [entityPopoverOpen, setEntityPopoverOpen] = useState(false);

  const { data: worksheets = [], isLoading } = useQuery({
    queryKey: ["worksheets"],
    queryFn: getWorksheets,
  });

  const { data: allEntities = [] } = useQuery({
    queryKey: ["worksheet_entities"],
    queryFn: getWorksheetEntities,
  });

  // Build worksheet_id set for entity filter + distinct entity options
  const { entityOptions, entityWorksheetIds } = useMemo(() => {
    const optMap = new Map<string, EntityOption>();
    const wsIds = new Set<string>();
    const filterKeys = new Set(entityFilters.map((f) => `${f.entity_type}:${f.entity_id}`));

    for (const e of allEntities) {
      const key = `${e.entity_type}:${e.entity_id}`;
      if (!optMap.has(key)) {
        optMap.set(key, { entity_type: e.entity_type, entity_id: e.entity_id, label: e.label });
      }
      if (filterKeys.has(key)) {
        wsIds.add(e.worksheet_id);
      }
    }

    return {
      entityOptions: Array.from(optMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
      entityWorksheetIds: wsIds,
    };
  }, [allEntities, entityFilters]);

  const filtered = useMemo(() => {
    let list = typeFilter === "all" ? worksheets : worksheets.filter((ws) => ws.document_type === typeFilter);
    if (entityFilters.length > 0) {
      list = list.filter((ws) => entityWorksheetIds.has(ws.id));
    }
    list = [...list].sort((a, b) => {
      const aVal = new Date(a[sortField]).getTime();
      const bVal = new Date(b[sortField]).getTime();
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });
    return list;
  }, [worksheets, typeFilter, sortField, sortDir, entityFilters, entityWorksheetIds]);

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worksheets"] });
      queryClient.invalidateQueries({ queryKey: ["worksheet_entities"] });
    },
  });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const toggleSortDir = () => setSortDir((d) => (d === "desc" ? "asc" : "desc"));

  return (
    <div className="mx-auto max-w-2xl px-3 sm:px-4 py-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Worksheets</h1>
        <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} size="sm" className="gap-1.5 sm:gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Worksheet</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
          <SelectTrigger className="w-[120px] h-8 text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="note">Note</SelectItem>
            <SelectItem value="skill">Skill</SelectItem>
            <SelectItem value="prompt">Prompt</SelectItem>
            <SelectItem value="template">Template</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated_at">Last Updated</SelectItem>
            <SelectItem value="created_at">Created At</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleSortDir} title={sortDir === "desc" ? "Newest first" : "Oldest first"}>
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>

        {/* Entity filter */}
        {entityOptions.length > 0 && (
          <>
            <Popover open={entityPopoverOpen} onOpenChange={setEntityPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                  {entityFilters.length > 0 ? `Entities (${entityFilters.length})` : "Filter by Entity"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[250px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search entities..." />
                  <CommandList>
                    <CommandEmpty>No entities found.</CommandEmpty>
                    <CommandGroup>
                      {entityOptions.map((eo) => {
                        const key = `${eo.entity_type}:${eo.entity_id}`;
                        const isSelected = entityFilters.some((f) => `${f.entity_type}:${f.entity_id}` === key);
                        return (
                          <CommandItem
                            key={key}
                            value={`${eo.label} ${eo.entity_type} ${eo.entity_id}`}
                            onSelect={() => {
                              setEntityFilters((prev) =>
                                isSelected
                                  ? prev.filter((f) => `${f.entity_type}:${f.entity_id}` !== key)
                                  : [...prev, eo]
                              );
                            }}
                          >
                            <span className={`mr-2 h-4 w-4 border rounded flex items-center justify-center text-[10px] ${isSelected ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground"}`}>
                              {isSelected ? "✓" : ""}
                            </span>
                            <span className="truncate">{eo.label}</span>
                            <span className="ml-auto text-[10px] text-muted-foreground">{eo.entity_type}</span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {entityFilters.length > 0 && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEntityFilters([])} title="Clear entity filter">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            )}
          </>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {worksheets.length === 0 ? "No worksheets yet. Create your first one!" : "No worksheets match the selected filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((ws) => (
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
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{ws.title}</p>
                    <Badge variant="outline" className="text-[10px] capitalize shrink-0">{ws.document_type || "note"}</Badge>
                  </div>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {sortField === "created_at" ? `Created ${formatDate(ws.created_at)}` : formatDate(ws.updated_at)}
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
