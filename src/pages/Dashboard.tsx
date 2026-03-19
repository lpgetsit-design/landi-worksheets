import { useState, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FileText, Clock, Trash2, ArrowUpDown, X, Search, Loader2, Sparkles, Check, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useAuth } from "@/components/AuthProvider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getWorksheets, createWorksheet, deleteWorksheet, getWorksheetEntities, hybridSearchWorksheets } from "@/lib/worksheets";
import type { HybridSearchResult } from "@/lib/worksheets";
import { toast } from "sonner";
import { marked } from "marked";
import TourOverlay from "@/components/tour/TourOverlay";
import { dashboardSteps } from "@/components/tour/tourSteps";
import { useTour } from "@/hooks/useTour";

type SortField = "updated_at" | "created_at";
type SortDir = "desc" | "asc";
type TypeFilter = "all" | "note" | "skill" | "prompt" | "template" | "design";

interface EntityOption {
  entity_type: string;
  entity_id: string;
  label: string;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tour = useTour("dashboard");

  const [sortField, setSortField] = useState<SortField>("updated_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [entityFilters, setEntityFilters] = useState<EntityOption[]>([]);
  const [entityPopoverOpen, setEntityPopoverOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<HybridSearchResult[] | null>(null);
  const [searchKeywords, setSearchKeywords] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

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

  // Hybrid search with debounce
  const executeSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults(null);
      setSearchKeywords([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    try {
      const { results, queryKeywords } = await hybridSearchWorksheets(q);
      setSearchResults(results);
      setSearchKeywords(queryKeywords);
    } catch (e) {
      console.error("Search error:", e);
      toast.error("Search failed");
      setSearchResults(null);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!value.trim()) {
      setSearchResults(null);
      setSearchKeywords([]);
      return;
    }
    // Longer debounce for long-form queries (job descriptions etc.)
    const delay = value.length > 100 ? 1500 : 600;
    searchTimeout.current = setTimeout(() => executeSearch(value), delay);
  }, [executeSearch]);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults(null);
    setSearchKeywords([]);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
  }, []);

  const isSearchActive = searchResults !== null;

  // Snippet extraction for search results
  const getSnippetHtml = useCallback((content: string | null, maxLen = 300) => {
    if (!content) return "";
    const trimmed = content.length > maxLen ? content.slice(0, maxLen) + "…" : content;
    return marked.parse(trimmed, { async: false }) as string;
  }, []);

  const scorePercent = (score: number) => Math.round(score * 100);

  return (
    <div className="mx-auto max-w-2xl px-3 sm:px-4 py-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Worksheets</h1>
        <Button data-tour="new-worksheet" onClick={() => createMutation.mutate()} disabled={createMutation.isPending} size="sm" className="gap-1.5 sm:gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Worksheet</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>

      {/* Search bar */}
      <div className="mb-4" data-tour="search-bar">
        <div className="relative flex items-center">
          <div className="absolute left-3 text-muted-foreground pointer-events-none">
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search documents… paste a job description, query, or keywords"
            className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Search keywords pills */}
        {searchKeywords.length > 0 && (
          <div className="mt-2 flex items-center gap-1 flex-wrap">
            <Sparkles className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-[10px] text-muted-foreground mr-1">Matched keywords:</span>
            {searchKeywords.map((kw) => (
              <span
                key={kw}
                className="inline-block rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {kw}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Filters (hidden during search) */}
      {!isSearchActive && (
        <div className="mb-4 flex items-center gap-1.5 sm:gap-2 flex-wrap overflow-x-auto" data-tour="type-filter">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
            <SelectTrigger className="w-[100px] sm:w-[120px] h-8 text-xs">
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
            <SelectTrigger className="w-[120px] sm:w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated_at">Last Updated</SelectItem>
              <SelectItem value="created_at">Created At</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={toggleSortDir} title={sortDir === "desc" ? "Newest first" : "Oldest first"}>
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
      )}

      {/* Search results mode */}
      {isSearchActive ? (
        isSearching ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Searching across all documents…</p>
          </div>
        ) : searchResults!.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Search className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No documents matched your search.</p>
            <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={clearSearch}>
              Clear search
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground mb-2">
              {searchResults!.length} result{searchResults!.length !== 1 ? "s" : ""} found
            </p>
            {searchResults!.map((sr) => {
              const summaryMd = (sr.meta as any)?.summary as string | undefined;
              const summaryHtml = summaryMd
                ? (marked.parse(summaryMd, { async: false }) as string).replace(
                    /\[\[CRM:([^:]*):([^:]*):([^\]]*)\]\]/g,
                    (_m, type, id, label) =>
                      `<span class="inline-flex max-w-full overflow-hidden items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground align-baseline mx-0.5"><span class="text-muted-foreground shrink-0">[${id}]</span> <span class="truncate min-w-0">${label}</span> <span class="text-muted-foreground font-semibold shrink-0">(${type})</span></span>`
                  )
                : null;

              return (
                <HoverCard key={sr.id} openDelay={300} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    <div
                      className="flex items-start gap-3 rounded-lg border border-border bg-background px-4 py-3 transition-colors hover:bg-accent cursor-pointer"
                      onClick={() => navigate(`/worksheet/${sr.id}`)}
                    >
                      <FileText className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-foreground">{sr.title}</p>
                          <Badge variant="outline" className="text-[10px] capitalize shrink-0">{sr.document_type || "note"}</Badge>
                        </div>
                        {sr.content_md && (
                          <div
                            className="prose prose-xs dark:prose-invert max-w-none text-xs text-muted-foreground mt-0.5 line-clamp-3 [&>*]:my-0 [&>ul]:pl-4 [&>ol]:pl-4"
                            dangerouslySetInnerHTML={{ __html: getSnippetHtml(sr.content_md, 300) }}
                          />
                        )}
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(sr.updated_at)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            Match: {scorePercent(sr.combined_score)}%
                          </span>
                          {sr.similarity_score > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              Semantic: {scorePercent(sr.similarity_score)}%
                            </span>
                          )}
                          {sr.keyword_score > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              Keywords: {scorePercent(sr.keyword_score)}%
                            </span>
                          )}
                        </div>
                        {sr.meta?.keywords && searchKeywords.length > 0 && (() => {
                          const docKws = sr.meta.keywords as string[];
                          const matched = searchKeywords.filter((kw) => docKws.includes(kw));
                          if (matched.length === 0) return null;
                          return (
                            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                              {matched.map((kw) => (
                                <span key={kw} className="inline-block rounded-full border border-border bg-accent px-1.5 py-0 text-[10px] text-foreground">
                                  {kw}
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </HoverCardTrigger>
                  {summaryHtml && (
                    <HoverCardContent
                      side="bottom"
                      align="start"
                      className="w-[calc(100vw-2rem)] sm:w-96 max-h-60 sm:max-h-80 overflow-y-auto p-3"
                      collisionPadding={16}
                    >
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Summary</p>
                      <div
                        className="prose prose-sm dark:prose-invert max-w-none text-sm"
                        dangerouslySetInnerHTML={{ __html: summaryHtml }}
                      />
                    </HoverCardContent>
                  )}
                </HoverCard>
              );
            })}
          </div>
        )
      ) : (
        /* Normal list mode */
        isLoading ? (
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
          <div className="space-y-2" data-tour="worksheet-list">
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
                {confirmDeleteId === ws.id ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMutation.mutate(ws.id);
                        setConfirmDeleteId(null);
                      }}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(null);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(ws.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* Tour */}
      <TourOverlay
        steps={dashboardSteps}
        step={tour.step}
        active={tour.active}
        onNext={tour.next}
        onPrev={tour.prev}
        onEnd={tour.end}
      />

      {/* Tour trigger */}
      <Button
        variant="outline"
        size="icon"
        className="fixed bottom-4 right-4 h-9 w-9 rounded-full shadow-md z-50"
        onClick={tour.start}
        title="Take a tour"
      >
        <HelpCircle className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default Dashboard;
