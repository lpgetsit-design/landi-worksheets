import React, { useMemo, useState, useCallback } from "react";
import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import { ArrowUp, ArrowDown, Filter, Grid3X3, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import TableFilterPopover, { type ColumnFilter } from "./TableFilterPopover";

export type ColumnType = "text" | "number" | "date" | "badge";

interface CellData {
  text: string;
  html: string;
  hasBadge: boolean;
  badgeLabels: string[];
  badgeTypes: string[];
  numericValue: number | null;
  dateValue: Date | null;
}

interface SortState {
  columnIndex: number;
  direction: "asc" | "desc";
}

function parseTableFromDOM(tableEl: HTMLTableElement) {
  const rows = Array.from(tableEl.querySelectorAll("tr"));
  if (rows.length === 0) return { headers: [] as string[], bodyRows: [] as CellData[][] };

  const headerRow = rows[0];
  const headers = Array.from(headerRow.querySelectorAll("th, td")).map(
    (cell) => (cell as HTMLElement).textContent?.trim() || ""
  );

  const bodyRows = rows.slice(1).map((row) =>
    Array.from(row.querySelectorAll("td, th")).map((cell) => {
      const el = cell as HTMLElement;
      const text = el.textContent?.trim() || "";
      const badges = Array.from(el.querySelectorAll("[data-crm-badge]"));
      const badgeLabels = badges.map((b) => {
        const spans = b.querySelectorAll("span");
        return spans.length >= 2 ? (spans[1] as HTMLElement).textContent?.trim() || "" : "";
      });
      const badgeTypes = badges.map(
        (b) => (b as HTMLElement).getAttribute("data-entity-type") || ""
      );

      let numericValue: number | null = null;
      const cleaned = text.replace(/[$,%]/g, "").trim();
      if (cleaned && !isNaN(Number(cleaned))) numericValue = Number(cleaned);

      let dateValue: Date | null = null;
      if (text && !numericValue) {
        const d = new Date(text);
        if (!isNaN(d.getTime()) && text.length > 4) dateValue = d;
      }

      return {
        text,
        html: el.innerHTML,
        hasBadge: badges.length > 0,
        badgeLabels,
        badgeTypes,
        numericValue,
        dateValue,
      } as CellData;
    })
  );

  return { headers, bodyRows };
}

function detectColumnType(rows: CellData[][], colIndex: number): ColumnType {
  const cells = rows.map((r) => r[colIndex]).filter(Boolean);
  const nonEmpty = cells.filter((c) => c.text.length > 0);
  if (nonEmpty.length === 0) return "text";

  if (nonEmpty.some((c) => c.hasBadge)) return "badge";
  if (nonEmpty.length > 0 && nonEmpty.every((c) => c.numericValue !== null)) return "number";
  if (nonEmpty.length > 0 && nonEmpty.every((c) => c.dateValue !== null)) return "date";
  return "text";
}

function applyFilter(cell: CellData, filter: ColumnFilter, colType: ColumnType): boolean {
  if (colType === "text" && filter.textSearch) {
    return cell.text.toLowerCase().includes(filter.textSearch.toLowerCase());
  }
  if (colType === "number") {
    if (cell.numericValue === null) return false;
    if (filter.min !== undefined && cell.numericValue < filter.min) return false;
    if (filter.max !== undefined && cell.numericValue > filter.max) return false;
    return true;
  }
  if (colType === "badge" && filter.selectedBadges && filter.selectedBadges.length > 0) {
    return cell.badgeLabels.some((l) => filter.selectedBadges!.includes(l)) ||
           cell.badgeTypes.some((t) => filter.selectedBadges!.includes(t));
  }
  if (colType === "date") {
    if (!cell.dateValue) return false;
    if (filter.dateFrom && cell.dateValue < filter.dateFrom) return false;
    if (filter.dateTo && cell.dateValue > filter.dateTo) return false;
    return true;
  }
  return true;
}

function compareCells(a: CellData, b: CellData, colType: ColumnType, dir: "asc" | "desc"): number {
  const mult = dir === "asc" ? 1 : -1;
  if (colType === "number") {
    return mult * ((a.numericValue ?? 0) - (b.numericValue ?? 0));
  }
  if (colType === "date") {
    return mult * ((a.dateValue?.getTime() ?? 0) - (b.dateValue?.getTime() ?? 0));
  }
  return mult * a.text.localeCompare(b.text);
}

const DataTableView: React.FC<{ node: any; editor: any }> = ({ node, editor }) => {
  const [dataMode, setDataMode] = useState(false);
  const [sort, setSort] = useState<SortState | null>(null);
  const [filters, setFilters] = useState<Record<number, ColumnFilter>>({});
  const [tableRef, setTableRef] = useState<HTMLTableElement | null>(null);

  const tableData = useMemo(() => {
    if (!tableRef) return null;
    return parseTableFromDOM(tableRef);
  }, [tableRef, dataMode, node.textContent]);

  const columnTypes = useMemo(() => {
    if (!tableData) return [] as ColumnType[];
    return tableData.headers.map((_, i) => detectColumnType(tableData.bodyRows, i));
  }, [tableData]);

  // Collect unique badge labels/types for badge columns
  const badgeOptions = useMemo(() => {
    if (!tableData) return {} as Record<number, string[]>;
    const opts: Record<number, string[]> = {};
    columnTypes.forEach((ct, i) => {
      if (ct === "badge") {
        const labels = new Set<string>();
        tableData.bodyRows.forEach((row) => {
          row[i]?.badgeLabels.forEach((l) => l && labels.add(l));
          row[i]?.badgeTypes.forEach((t) => t && labels.add(t));
        });
        opts[i] = Array.from(labels);
      }
    });
    return opts;
  }, [tableData, columnTypes]);

  const processedRows = useMemo(() => {
    if (!tableData || !dataMode) return null;
    let rows = [...tableData.bodyRows];

    // Apply filters
    Object.entries(filters).forEach(([colStr, filter]) => {
      const col = Number(colStr);
      const ct = columnTypes[col];
      if (!ct) return;
      rows = rows.filter((row) => {
        const cell = row[col];
        if (!cell) return true;
        return applyFilter(cell, filter, ct);
      });
    });

    // Apply sort
    if (sort) {
      const ct = columnTypes[sort.columnIndex];
      rows.sort((a, b) =>
        compareCells(a[sort.columnIndex], b[sort.columnIndex], ct, sort.direction)
      );
    }

    return rows;
  }, [tableData, dataMode, filters, sort, columnTypes]);

  const handleSort = useCallback((colIndex: number) => {
    setSort((prev) => {
      if (!prev || prev.columnIndex !== colIndex) return { columnIndex: colIndex, direction: "asc" };
      if (prev.direction === "asc") return { columnIndex: colIndex, direction: "desc" };
      return null;
    });
  }, []);

  const handleFilterChange = useCallback((colIndex: number, filter: ColumnFilter | null) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (!filter) delete next[colIndex];
      else next[colIndex] = filter;
      return next;
    });
  }, []);

  const hasActiveFilters = Object.keys(filters).length > 0 || sort !== null;

  return (
    <NodeViewWrapper as="div" className="relative group/datatable my-4">
      {/* Toggle button */}
      <div className="absolute -top-3 right-0 z-10 opacity-0 group-hover/datatable:opacity-100 transition-opacity">
        <Button
          variant="outline"
          size="sm"
          className="h-6 gap-1 text-[10px] px-2 bg-background border-border"
          onClick={() => setDataMode((prev) => !prev)}
        >
          {dataMode ? (
            <>
              <Grid3X3 className="h-3 w-3" /> Edit
            </>
          ) : (
            <>
              <Filter className="h-3 w-3" /> Data
            </>
          )}
        </Button>
      </div>

      {dataMode && tableData ? (
        /* Data mode: rendered interactive table */
        <div className="border border-border rounded-md overflow-auto data-table-active">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {tableData.headers.map((header, i) => {
                  const ct = columnTypes[i];
                  const isSorted = sort?.columnIndex === i;
                  const hasFilter = !!filters[i];
                  return (
                    <th
                      key={i}
                      className="relative border border-border bg-muted px-3 py-2 text-left font-semibold text-foreground select-none"
                    >
                      <div className="flex items-center gap-1">
                        <button
                          className="flex items-center gap-1 hover:text-primary transition-colors flex-1 text-left"
                          onClick={() => handleSort(i)}
                        >
                          <span>{header}</span>
                          {isSorted ? (
                            sort.direction === "asc" ? (
                              <ArrowUp className="h-3 w-3 text-primary" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-primary" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-muted-foreground opacity-0 group-hover/datatable:opacity-50" />
                          )}
                        </button>
                        <TableFilterPopover
                          columnType={ct}
                          filter={filters[i] || null}
                          badgeOptions={badgeOptions[i]}
                          onChange={(f) => handleFilterChange(i, f)}
                        />
                        {hasFilter && (
                          <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary" />
                        )}
                      </div>
                      <span className="text-[9px] text-muted-foreground font-normal capitalize">
                        {ct}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {processedRows && processedRows.length > 0 ? (
                processedRows.map((row, ri) => (
                  <tr key={ri} className="hover:bg-accent/50 transition-colors">
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className="border border-border px-3 py-2 text-foreground"
                        dangerouslySetInnerHTML={{ __html: cell.html }}
                      />
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={tableData.headers.length}
                    className="border border-border px-3 py-4 text-center text-muted-foreground"
                  >
                    No matching rows
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {hasActiveFilters && (
            <div className="flex items-center gap-2 px-3 py-1.5 border-t border-border bg-muted/50 text-xs text-muted-foreground">
              <span>
                {processedRows?.length ?? 0} of {tableData.bodyRows.length} rows
              </span>
              <button
                className="ml-auto underline hover:text-foreground"
                onClick={() => {
                  setFilters({});
                  setSort(null);
                }}
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Edit mode: default TipTap table */
        <div ref={(el) => {
          if (el) {
            const table = el.querySelector("table");
            setTableRef(table);
          }
        }}>
          <NodeViewContent
            as="div"
            className="[&>table]:border-collapse [&>table]:w-full [&>table]:table-fixed [&>table]:overflow-hidden [&>table]:my-0"
          />
        </div>
      )}
    </NodeViewWrapper>
  );
};

export default DataTableView;
