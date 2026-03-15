import { Extension } from "@tiptap/core";

/**
 * Keyboard shortcuts for table operations:
 * - Ctrl+Enter / Cmd+Enter: Add row below
 * - Ctrl+Shift+Enter / Cmd+Shift+Enter: Add row above
 * - Tab: Move to next cell (built-in, but we ensure it works)
 */
const TableKeyboardShortcuts = Extension.create({
  name: "tableKeyboardShortcuts",

  addKeyboardShortcuts() {
    return {
      "Mod-Enter": ({ editor }) => {
        if (!editor.isActive("table")) return false;
        return editor.chain().addRowAfter().run();
      },
      "Mod-Shift-Enter": ({ editor }) => {
        if (!editor.isActive("table")) return false;
        return editor.chain().addRowBefore().run();
      },
    };
  },
});

export default TableKeyboardShortcuts;
