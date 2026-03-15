import { useState, useCallback } from "react";
import { Editor } from "@tiptap/react";
import {
  Plus,
  Minus,
  Trash2,
  ArrowUpFromLine,
  ArrowDownFromLine,
  ArrowLeftFromLine,
  ArrowRightFromLine,
  Merge,
  SplitSquareVertical,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TableControlsProps {
  editor: Editor;
}

const TinyButton = ({
  onClick,
  title,
  children,
  variant = "ghost",
  destructive = false,
  active = false,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  variant?: "ghost" | "outline";
  destructive?: boolean;
  active?: boolean;
}) => (
  <Button
    variant={variant}
    size="icon"
    className={cn(
      "h-7 w-7",
      destructive && "text-destructive hover:bg-destructive/10 hover:text-destructive",
      active && "bg-accent text-accent-foreground"
    )}
    onClick={onClick}
    title={title}
    type="button"
  >
    {children}
  </Button>
);

/* ── helpers to read / reorder ProseMirror table rows ── */

function getTableInfo(editor: Editor) {
  const { $from } = editor.state.selection;
  let depth = $from.depth;
  while (depth > 0) {
    if ($from.node(depth).type.name === "table") break;
    depth--;
  }
  if (depth === 0) return null;

  const tableNode = $from.node(depth);
  const tablePos = ($from as any).before(depth);

  // Find which column the cursor is in
  let cellDepth = $from.depth;
  while (cellDepth > depth) {
    const n = $from.node(cellDepth);
    if (n.type.name === "tableCell" || n.type.name === "tableHeader") break;
    cellDepth--;
  }

  // Count column index
  let colIndex = 0;
  if (cellDepth > depth) {
    const rowNode = $from.node(cellDepth - 1);
    const cellPos = ($from as any).before(cellDepth);
    let pos = ($from as any).before(cellDepth - 1) + 1; // start of row content
    for (let i = 0; i < rowNode.childCount; i++) {
      if (pos === cellPos) {
        colIndex = i;
        break;
      }
      pos += rowNode.child(i).nodeSize;
    }
  }

  return { tableNode, tablePos, depth, colIndex };
}

function getCellText(row: any, colIndex: number): string {
  if (colIndex >= row.childCount) return "";
  return row.child(colIndex).textContent.trim().toLowerCase();
}

function sortTable(editor: Editor, colIndex: number, direction: "asc" | "desc") {
  const info = getTableInfo(editor);
  if (!info) return;
  const { tableNode, tablePos } = info;

  // Separate header rows (first row if it contains tableHeader cells) and body rows
  const headerRows: any[] = [];
  const bodyRows: any[] = [];

  for (let i = 0; i < tableNode.childCount; i++) {
    const row = tableNode.child(i);
    const firstCell = row.childCount > 0 ? row.child(0) : null;
    if (i === 0 && firstCell?.type.name === "tableHeader") {
      headerRows.push(row);
    } else {
      bodyRows.push(row);
    }
  }

  bodyRows.sort((a, b) => {
    const aText = getCellText(a, colIndex);
    const bText = getCellText(b, colIndex);
    // Try numeric comparison first
    const aNum = parseFloat(aText);
    const bNum = parseFloat(bText);
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return direction === "asc" ? aNum - bNum : bNum - aNum;
    }
    const cmp = aText.localeCompare(bText);
    return direction === "asc" ? cmp : -cmp;
  });

  const allRows = [...headerRows, ...bodyRows];

  // Rebuild the table node
  const { tr } = editor.state;
  const newTable = tableNode.type.create(tableNode.attrs, allRows);
  const transaction = tr.replaceWith(tablePos, tablePos + tableNode.nodeSize, newTable);
  editor.view.dispatch(transaction);
}

/* ── filter logic: hides rows via DOM class ── */

function applyFilter(editor: Editor, filterText: string) {
  const editorDom = editor.view.dom;
  const tables = editorDom.querySelectorAll("table");
  tables.forEach((table) => {
    const rows = table.querySelectorAll("tr");
    rows.forEach((row, idx) => {
      // Skip header row
      if (idx === 0 && row.querySelector("th")) {
        (row as HTMLElement).style.display = "";
        return;
      }
      if (!filterText.trim()) {
        (row as HTMLElement).style.display = "";
        return;
      }
      const text = row.textContent?.toLowerCase() || "";
      const match = text.includes(filterText.toLowerCase());
      (row as HTMLElement).style.display = match ? "" : "none";
    });
  });
}

const TableControls = ({ editor }: TableControlsProps) => {
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showFilter, setShowFilter] = useState(false);
  const [filterText, setFilterText] = useState("");

  const handleSort = useCallback(() => {
    const info = getTableInfo(editor);
    if (!info) return;
    const col = info.colIndex;
    let newDir: "asc" | "desc" = "asc";
    if (sortCol === col) {
      newDir = sortDir === "asc" ? "desc" : "asc";
    }
    setSortCol(col);
    setSortDir(newDir);
    sortTable(editor, col, newDir);
  }, [editor, sortCol, sortDir]);

  const handleFilterChange = useCallback(
    (value: string) => {
      setFilterText(value);
      applyFilter(editor, value);
    },
    [editor]
  );

  const handleClearFilter = useCallback(() => {
    setFilterText("");
    setShowFilter(false);
    applyFilter(editor, "");
  }, [editor]);

  if (!editor.isActive("table")) return null;

  const canMerge = editor.can().mergeCells();
  const canSplit = editor.can().splitCell();

  return (
    <div className="flex flex-col gap-1 mb-1 animate-in fade-in slide-in-from-top-1 duration-150">
      <div className="flex items-center gap-0.5 rounded-md border border-border bg-muted/50 px-1 py-0.5 text-xs">
        <span className="text-muted-foreground text-[10px] font-medium px-1 select-none">Table</span>
        <span className="text-muted-foreground/60 text-[9px] px-0.5 select-none hidden sm:inline">⌘↵ add row</span>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        <TinyButton onClick={() => editor.chain().focus().addRowBefore().run()} title="Add row above">
          <ArrowUpFromLine className="h-3.5 w-3.5" />
        </TinyButton>
        <TinyButton onClick={() => editor.chain().focus().addRowAfter().run()} title="Add row below (Ctrl+Enter)">
          <ArrowDownFromLine className="h-3.5 w-3.5" />
        </TinyButton>
        <TinyButton onClick={() => editor.chain().focus().addColumnBefore().run()} title="Add column left">
          <ArrowLeftFromLine className="h-3.5 w-3.5" />
        </TinyButton>
        <TinyButton onClick={() => editor.chain().focus().addColumnAfter().run()} title="Add column right">
          <ArrowRightFromLine className="h-3.5 w-3.5" />
        </TinyButton>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        <TinyButton onClick={() => editor.chain().focus().deleteRow().run()} title="Delete row" destructive>
          <Minus className="h-3.5 w-3.5" />
        </TinyButton>
        <TinyButton onClick={() => editor.chain().focus().deleteColumn().run()} title="Delete column" destructive>
          <Minus className="h-3.5 w-3.5 rotate-90" />
        </TinyButton>

        {(canMerge || canSplit) && (
          <>
            <Separator orientation="vertical" className="mx-0.5 h-5" />
            {canMerge && (
              <TinyButton onClick={() => editor.chain().focus().mergeCells().run()} title="Merge cells">
                <Merge className="h-3.5 w-3.5" />
              </TinyButton>
            )}
            {canSplit && (
              <TinyButton onClick={() => editor.chain().focus().splitCell().run()} title="Split cell">
                <SplitSquareVertical className="h-3.5 w-3.5" />
              </TinyButton>
            )}
          </>
        )}

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        {/* Sort by current column */}
        <TinyButton onClick={handleSort} title="Sort by current column" active={sortCol !== null}>
          {sortCol !== null ? (
            sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5" />
          )}
        </TinyButton>

        {/* Filter toggle */}
        <TinyButton
          onClick={() => {
            if (showFilter) {
              handleClearFilter();
            } else {
              setShowFilter(true);
            }
          }}
          title={showFilter ? "Clear filter" : "Filter rows"}
          active={showFilter}
        >
          <Filter className="h-3.5 w-3.5" />
        </TinyButton>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        <TinyButton onClick={() => editor.chain().focus().deleteTable().run()} title="Delete table" destructive>
          <Trash2 className="h-3.5 w-3.5" />
        </TinyButton>
      </div>

      {/* Filter input row */}
      {showFilter && (
        <div className="flex items-center gap-1.5 px-1 animate-in fade-in slide-in-from-top-1 duration-100">
          <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            value={filterText}
            onChange={(e) => handleFilterChange(e.target.value)}
            placeholder="Filter rows…"
            className="h-7 text-xs flex-1"
            autoFocus
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={handleClearFilter}
            title="Clear filter"
            type="button"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default TableControls;
