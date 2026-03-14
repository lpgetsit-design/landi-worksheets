import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { useCallback, useState } from "react";
import TurndownService from "turndown";
import SelectionToolbar from "./SelectionToolbar";
import EditorToolbar from "./EditorToolbar";

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

interface WorksheetEditorProps {
  onSelectionAI?: (text: string) => void;
}

const WorksheetEditor = ({ onSelectionAI }: WorksheetEditorProps) => {
  const [title, setTitle] = useState("Untitled");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: "Write something...",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose dark:prose-invert max-w-none focus:outline-none min-h-[60vh] font-serif",
      },
    },
    onUpdate: ({ editor }) => {
      // Auto-save debounce would go here
      const html = editor.getHTML();
      const json = editor.getJSON();
      const md = turndown.turndown(html);
      // Will save to Supabase when connected
      console.log("Content updated", { html: html.length, md: md.length });
    },
  });

  const handleAskAI = useCallback(
    (text: string) => {
      onSelectionAI?.(text);
    },
    [onSelectionAI]
  );

  return (
    <div className="flex flex-col">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mb-4 bg-transparent text-3xl font-bold text-foreground outline-none placeholder:text-muted-foreground"
        placeholder="Untitled"
      />

      {editor && <EditorToolbar editor={editor} />}

      <div className="relative mt-2">
        {editor && <SelectionToolbar editor={editor} onAskAI={handleAskAI} />}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

export default WorksheetEditor;
