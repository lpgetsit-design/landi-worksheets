import { useEffect, useState, useCallback } from "react";
import { Editor } from "@tiptap/react";
import { Sparkles, Minimize2, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SelectionToolbarProps {
  editor: Editor;
  onAskAI: (text: string, instruction?: string) => void;
}

const SelectionToolbar = ({ editor, onAskAI }: SelectionToolbarProps) => {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    const { from, to } = editor.state.selection;
    if (from === to) {
      setShow(false);
      return;
    }

    const selectedText = editor.state.doc.textBetween(from, to, " ");
    if (!selectedText.trim()) {
      setShow(false);
      return;
    }

    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) {
      setShow(false);
      return;
    }

    const range = domSelection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const editorEl = editor.view.dom.closest(".relative");
    if (!editorEl) return;
    const editorRect = editorEl.getBoundingClientRect();

    setPosition({
      top: rect.top - editorRect.top - 44,
      left: rect.left - editorRect.left + rect.width / 2,
    });
    setShow(true);
  }, [editor]);

  useEffect(() => {
    editor.on("selectionUpdate", updatePosition);
    return () => {
      editor.off("selectionUpdate", updatePosition);
    };
  }, [editor, updatePosition]);

  // Hide on click outside
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const toolbar = document.getElementById("selection-toolbar");
      if (toolbar && !toolbar.contains(e.target as Node)) {
        // Allow selection changes to be handled by selectionUpdate
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  if (!show) return null;

  const getSelectedText = () => {
    const { from, to } = editor.state.selection;
    return editor.state.doc.textBetween(from, to, " ");
  };

  return (
    <div
      id="selection-toolbar"
      className="absolute z-50 flex items-center gap-1 rounded-md border border-border bg-background p-1 shadow-md transition-all duration-200 animate-in fade-in-0 zoom-in-95"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        transform: "translateX(-50%)",
      }}
    >
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() => onAskAI(getSelectedText())}
      >
        <Sparkles className="h-3 w-3" />
        Ask AI
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() => {
          // Will trigger AI simplify
          onAskAI(`Simplify this: ${getSelectedText()}`);
        }}
      >
        <Minimize2 className="h-3 w-3" />
        Simplify
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() => {
          // Will trigger AI expand
          onAskAI(`Expand on this: ${getSelectedText()}`);
        }}
      >
        <Maximize2 className="h-3 w-3" />
        Expand
      </Button>
    </div>
  );
};

export default SelectionToolbar;
