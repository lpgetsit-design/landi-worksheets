import { useEffect, useState, useCallback, useRef } from "react";
import { Editor } from "@tiptap/react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface TableEdgeButtonsProps {
  editor: Editor;
}

const TableEdgeButtons = ({ editor }: TableEdgeButtonsProps) => {
  const [tableRect, setTableRect] = useState<DOMRect | null>(null);
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null);
  const [visible, setVisible] = useState(false);
  const rafRef = useRef<number>(0);

  const updatePosition = useCallback(() => {
    if (!editor.isActive("table")) {
      setVisible(false);
      return;
    }

    const { $from } = editor.state.selection;
    // Walk up to find table node
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
    // The actual table element might be wrapped in a .tableWrapper div
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

    setTableRect(tableEl.getBoundingClientRect());
    setContainerRect(container.getBoundingClientRect());
    setVisible(true);
  }, [editor]);

  useEffect(() => {
    const handler = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updatePosition);
    };

    editor.on("selectionUpdate", handler);
    editor.on("update", handler);
    // Also recheck on transaction
    editor.on("transaction", handler);

    return () => {
      cancelAnimationFrame(rafRef.current);
      editor.off("selectionUpdate", handler);
      editor.off("update", handler);
      editor.off("transaction", handler);
    };
  }, [editor, updatePosition]);

  if (!visible || !tableRect || !containerRect) return null;

  const top = tableRect.bottom - containerRect.top;
  const left = tableRect.left - containerRect.left;
  const width = tableRect.width;
  const height = tableRect.height;
  const rightEdge = left + width;
  const tableTop = tableRect.top - containerRect.top;

  return (
    <>
      {/* Add row button — centered below the table */}
      <button
        type="button"
        className="absolute z-10 flex items-center justify-center rounded-full border border-border bg-background shadow-sm hover:bg-accent hover:border-primary transition-all duration-150 opacity-0 hover:opacity-100 group-hover/table-area:opacity-60"
        style={{
          top: `${top + 2}px`,
          left: `${left + width / 2 - 12}px`,
          width: 24,
          height: 24,
        }}
        onClick={() => editor.chain().focus().addRowAfter().run()}
        title="Add row below"
      >
        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {/* Add column button — centered on the right edge */}
      <button
        type="button"
        className="absolute z-10 flex items-center justify-center rounded-full border border-border bg-background shadow-sm hover:bg-accent hover:border-primary transition-all duration-150 opacity-0 hover:opacity-100 group-hover/table-area:opacity-60"
        style={{
          top: `${tableTop + height / 2 - 12}px`,
          left: `${rightEdge + 4}px`,
          width: 24,
          height: 24,
        }}
        onClick={() => editor.chain().focus().addColumnAfter().run()}
        title="Add column right"
      >
        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </>
  );
};

export default TableEdgeButtons;
