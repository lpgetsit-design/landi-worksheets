import React from "react";
import { Filter } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { ColumnType } from "./DataTableView";

export interface ColumnFilter {
  textSearch?: string;
  min?: number;
  max?: number;
  selectedBadges?: string[];
  dateFrom?: Date;
  dateTo?: Date;
}

interface TableFilterPopoverProps {
  columnType: ColumnType;
  filter: ColumnFilter | null;
  badgeOptions?: string[];
  onChange: (filter: ColumnFilter | null) => void;
}

const TableFilterPopover: React.FC<TableFilterPopoverProps> = ({
  columnType,
  filter,
  badgeOptions,
  onChange,
}) => {
  const hasFilter = !!filter;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`p-0.5 rounded hover:bg-accent transition-colors ${
            hasFilter ? "text-primary" : "text-muted-foreground opacity-50 hover:opacity-100"
          }`}
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start" side="bottom">
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground capitalize">
            Filter ({columnType})
          </p>

          {columnType === "text" && (
            <Input
              placeholder="Search..."
              className="h-7 text-xs"
              value={filter?.textSearch || ""}
              onChange={(e) =>
                onChange(e.target.value ? { textSearch: e.target.value } : null)
              }
            />
          )}

          {columnType === "number" && (
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Min"
                className="h-7 text-xs flex-1"
                value={filter?.min ?? ""}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : undefined;
                  const next = { ...filter, min: val };
                  if (next.min === undefined && next.max === undefined) onChange(null);
                  else onChange(next);
                }}
              />
              <Input
                type="number"
                placeholder="Max"
                className="h-7 text-xs flex-1"
                value={filter?.max ?? ""}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : undefined;
                  const next = { ...filter, max: val };
                  if (next.min === undefined && next.max === undefined) onChange(null);
                  else onChange(next);
                }}
              />
            </div>
          )}

          {columnType === "badge" && badgeOptions && (
            <div className="max-h-40 overflow-auto space-y-1">
              {badgeOptions.map((opt) => {
                const selected = filter?.selectedBadges?.includes(opt) || false;
                return (
                  <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={selected}
                      onCheckedChange={(checked) => {
                        const current = filter?.selectedBadges || [];
                        const next = checked
                          ? [...current, opt]
                          : current.filter((b) => b !== opt);
                        onChange(next.length > 0 ? { selectedBadges: next } : null);
                      }}
                    />
                    <span className="truncate">{opt}</span>
                  </label>
                );
              })}
            </div>
          )}

          {columnType === "date" && (
            <div className="space-y-1">
              <Input
                type="date"
                className="h-7 text-xs"
                value={filter?.dateFrom ? filter.dateFrom.toISOString().split("T")[0] : ""}
                onChange={(e) => {
                  const val = e.target.value ? new Date(e.target.value) : undefined;
                  const next = { ...filter, dateFrom: val };
                  if (!next.dateFrom && !next.dateTo) onChange(null);
                  else onChange(next);
                }}
              />
              <Input
                type="date"
                className="h-7 text-xs"
                value={filter?.dateTo ? filter.dateTo.toISOString().split("T")[0] : ""}
                onChange={(e) => {
                  const val = e.target.value ? new Date(e.target.value) : undefined;
                  const next = { ...filter, dateTo: val };
                  if (!next.dateFrom && !next.dateTo) onChange(null);
                  else onChange(next);
                }}
              />
            </div>
          )}

          {hasFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-6 text-xs"
              onClick={() => onChange(null)}
            >
              Clear filter
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TableFilterPopover;
