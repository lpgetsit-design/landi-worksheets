import { useEffect, useState, useCallback, useRef } from "react";
import { Editor } from "@tiptap/react";
import { Plus, X } from "lucide-react";

interface TableEdgeButtonsProps {
  editor: Editor;
}

interface Positions {
  tableRect: DOMRect;
  containerRect: DOMRect;
  cellRect: DOMRect | null;
}

const TableEdgeButtons = ({ editor }: TableEdgeButtonsProps) => {
  const [pos, setPos] = useState<Positions | null>(null);
  const [visible, setVisible] = useState(false);
  const rafRef = useRef<number>(0);

  const updatePosition = useCallback(() => {
    if (!editor.isActive("table")) {
      setVisible(false);
      return;
    }

    const { $from } = editor.state.selection;
    let depth = $from.depth;
    while (depth > 0) {
      const node = $from.node(depth);
      if (node.type.name === "table") break;
      depth--;
    }
    if (depth === 0) {
      setVisible(false);
      return;
    }

    const dom = editor.view.nodeDOM(($from as any).before(depth));
    const tableEl =
      dom instanceof HTMLTableElement
        ? dom
        : dom instanceof HTMLElement
        ? dom.querySelector("table")
        : null;

    if (!tableEl) {
      setVisible(false);
      return;
    }

    const container = tableEl.closest(".ProseMirror") as HTMLElement | null;
    if (!container) {
      setVisible(false);
      return;
    }

    // Find the current cell DOM element
    let cellEl: HTMLElement | null = null;
    const sel = window.getSelection();
    if (sel && sel.anchorNode) {
      let node: Node | null = sel.anchorNode;
      while (node && node !== tableEl) {
        if (node instanceof HTMLElement && (node.tagName === "TD" || node.tagName === "TH")) {
          cellEl = node;
          break;
        }
        node = node.parentNode;
      }
    }

    setPos({
      tableRect: tableEl.getBoundingClientRect(),
      containerRect: container.getBoundingClientRect(),
      cellRect: cellEl ? cellEl.getBoundingClientRect() : null,
    });
    setVisible(true);
  }, [editor]);

  useEffect(() => {
    const handler = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updatePosition);
    };

    editor.on("selectionUpdate", handler);
    editor.on("update", handler);
    editor.on("transaction", handler);

    return () => {
      cancelAnimationFrame(rafRef.current);
      editor.off("selectionUpdate", handler);
      editor.off("update", handler);
      editor.off("transaction", handler);
    };
  }, [editor, updatePosition]);

  if (!visible || !pos) return null;

  const { tableRect, containerRect, cellRect } = pos;
  const tTop = tableRect.top - containerRect.top;
  const tLeft = tableRect.left - containerRect.left;
  const tWidth = tableRect.width;
  const tHeight = tableRect.height;
  const tBottom = tTop + tHeight;
  const tRight = tLeft + tWidth;

  const btnClass =
    "absolute z-10 flex items-center justify-center rounded-full border border-border bg-background shadow-sm transition-all duration-150 opacity-0 hover:opacity-100 group-hover/table-area:opacity-60";

  return (
    <>
      {/* Add row — below table */}
      <button
        type="button"
        className={`${btnClass} hover:bg-accent hover:border-primary`}
        style={{ top: `${tBottom + 2}px`, left: `${tLeft + tWidth / 2 - 12}px`, width: 24, height: 24 }}
        onClick={() => editor.chain().focus().addRowAfter().run()}
        title="Add row below"
      >
        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {/* Add column — right of table */}
      <button
        type="button"
        className={`${btnClass} hover:bg-accent hover:border-primary`}
        style={{ top: `${tTop + tHeight / 2 - 12}px`, left: `${tRight + 4}px`, width: 24, height: 24 }}
        onClick={() => editor.chain().focus().addColumnAfter().run()}
        title="Add column right"
      >
        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {/* Delete row — left of the current row */}
      {cellRect && (
        <button
          type="button"
          className={`${btnClass} hover:bg-destructive/10 hover:border-destructive`}
          style={{
            top: `${cellRect.top - containerRect.top + cellRect.height / 2 - 10}px`,
            left: `${tLeft - 28}px`,
            width: 20,
            height: 20,
          }}
          onClick={() => editor.chain().focus().deleteRow().run()}
          title="Delete row"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      )}

      {/* Delete column — above the current column */}
      {cellRect && (
        <button
          type="button"
          className={`${btnClass} hover:bg-destructive/10 hover:border-destructive`}
          style={{
            top: `${tTop - 26}px`,
            left: `${cellRect.left - containerRect.left + cellRect.width / 2 - 10}px`,
            width: 20,
            height: 20,
          }}
          onClick={() => editor.chain().focus().deleteColumn().run()}
          title="Delete column"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
    </>
  );
};

export default TableEdgeButtons;
