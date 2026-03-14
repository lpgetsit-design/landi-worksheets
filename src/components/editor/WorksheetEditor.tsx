import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { useCallback, useEffect, useRef, useState } from "react";
import TurndownService from "turndown";
import SelectionToolbar from "./SelectionToolbar";
import EditorToolbar from "./EditorToolbar";
import { updateWorksheet } from "@/lib/worksheets";
import type { DocumentType } from "@/lib/worksheets";
import type { Json } from "@/integrations/supabase/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

export interface WorksheetEditorHandle {
  setContent: (html: string) => void;
  getHTML: () => string;
}

interface WorksheetEditorProps {
  worksheetId: string;
  initialTitle: string;
  initialContent: Json | null;
  initialDocumentType: DocumentType;
  onSelectionAI?: (text: string) => void;
  onContentChange?: (text: string) => void;
  editorRef?: React.MutableRefObject<WorksheetEditorHandle | null>;
}

const WorksheetEditor = ({ worksheetId, initialTitle, initialContent, initialDocumentType, onSelectionAI, onContentChange, editorRef }: WorksheetEditorProps) => {
    const [title, setTitle] = useState(initialTitle);
    const [documentType, setDocumentType] = useState<DocumentType>(initialDocumentType);
    const saveTimeout = useRef<ReturnType<typeof setTimeout>>();

    const editor = useEditor({
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
        Placeholder.configure({ placeholder: "Write something..." }),
        TaskList,
        TaskItem.configure({ nested: true }),
      ],
      content: (initialContent as any) || "",
      editorProps: {
        attributes: {
          class: "prose prose-sm sm:prose dark:prose-invert max-w-none focus:outline-none min-h-[60vh] font-serif",
        },
      },
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        const md = turndown.turndown(html);
        onContentChange?.(md);

        if (saveTimeout.current) clearTimeout(saveTimeout.current);
        saveTimeout.current = setTimeout(() => {
          const json = editor.getJSON();
          updateWorksheet(worksheetId, {
            content_json: json as unknown as Json,
            content_html: html,
            content_md: md,
          }).catch(console.error);
        }, 500);
      },
    });

    // Expose editor handle via callback ref
    useEffect(() => {
      if (editorRef && editor) {
        editorRef.current = {
          setContent: (html: string) => editor.commands.setContent(html),
          getHTML: () => editor.getHTML(),
        };
      }
    }, [editor, editorRef]);

    // Save title on change with debounce
    useEffect(() => {
      const t = setTimeout(() => {
        if (title !== initialTitle) {
          updateWorksheet(worksheetId, { title }).catch(console.error);
        }
      }, 500);
      return () => clearTimeout(t);
    }, [title, worksheetId, initialTitle]);

    const handleAskAI = useCallback(
      (text: string) => { onSelectionAI?.(text); },
      [onSelectionAI]
    );

    const handleDocumentTypeChange = useCallback((value: string) => {
      const newType = value as DocumentType;
      setDocumentType(newType);
      updateWorksheet(worksheetId, { document_type: newType } as any).catch(console.error);
    }, [worksheetId]);

    return (
      <div className="flex flex-col">
        <div className="mb-4 flex items-center gap-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 bg-transparent text-3xl font-bold text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Untitled"
          />
          <Select value={documentType} onValueChange={handleDocumentTypeChange}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="note">Note</SelectItem>
              <SelectItem value="skill">Skill</SelectItem>
              <SelectItem value="prompt">Prompt</SelectItem>
              <SelectItem value="template">Template</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {editor && <EditorToolbar editor={editor} />}
        <div className="relative mt-2">
          {editor && <SelectionToolbar editor={editor} onAskAI={handleAskAI} />}
          <EditorContent editor={editor} />
        </div>
      </div>
    );
};

export default WorksheetEditor;
