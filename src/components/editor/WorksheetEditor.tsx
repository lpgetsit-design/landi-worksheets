import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Link } from "@tiptap/extension-link";
import { useCallback, useEffect, useRef, useState } from "react";
import TurndownService from "turndown";
import SelectionToolbar from "./SelectionToolbar";
import EditorToolbar from "./EditorToolbar";
import TableControls from "./TableControls";
import CrmBadgeNode from "./CrmBadgeNode";
import SlashCommandExtension from "./SlashCommandExtension";
import { updateWorksheet, syncWorksheetEntities } from "@/lib/worksheets";
import type { DocumentType } from "@/lib/worksheets";
import type { Json } from "@/integrations/supabase/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { marked } from "marked";

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

// Custom Turndown rule: serialize CRM badge spans into [[CRM:entityType:entityId:label]] placeholders
turndown.addRule("crmBadge", {
  filter: (node) =>
    node.nodeName === "SPAN" && node.hasAttribute("data-crm-badge"),
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const entityType = el.getAttribute("data-entity-type") || "";
    const entityId = el.getAttribute("data-entity-id") || "";
    // Extract label from the second child span (the name span)
    const spans = el.querySelectorAll("span");
    let label = "";
    if (spans.length >= 2) {
      label = (spans[1] as HTMLElement).textContent?.trim() || "";
    }
    return `[[CRM:${entityType}:${entityId}:${label}]]`;
  },
});

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

const GenerateTitleButton = ({
  worksheetId,
  getContent,
  onTitleGenerated,
}: {
  worksheetId: string;
  getContent: () => string;
  onTitleGenerated: (title: string) => void;
}) => {
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    const content = getContent();
    if (!content.trim()) {
      onTitleGenerated("Untitled");
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: `Generate a short, concise title (max 6 words, no quotes) for this worksheet content:\n\n${content.slice(0, 2000)}`,
            },
          ],
          worksheetTitle: "Untitled",
          worksheetContent: content.slice(0, 2000),
          worksheetType: "note",
        }),
      });
      if (!resp.ok) throw new Error("Failed to generate title");
      const choice = await resp.json();
      let title = choice.message?.content || "";
      // If the AI used the update_worksheet_title tool, extract the title from it
      if (!title && choice.message?.tool_calls?.length) {
        for (const tc of choice.message.tool_calls) {
          if (tc.function?.name === "update_worksheet_title") {
            try {
              const args = JSON.parse(tc.function.arguments);
              title = args.title || "";
            } catch {}
          }
        }
      }
      title = title.replace(/^["']|["']$/g, "").trim();
      onTitleGenerated(title || "Untitled");
    } catch (e) {
      console.error("Title generation error:", e);
      toast.error("Failed to generate title");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0"
      onClick={generate}
      disabled={loading}
      title="Generate title from content"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <Sparkles className="h-4 w-4 text-muted-foreground" />
      )}
    </Button>
  );
};

const ENHANCE_PROMPTS: Record<DocumentType, string> = {
  note: "Rewrite this note in a cleaner, well-organized format with proper headings, bullet points, and paragraphs where appropriate.",
  skill: "Rewrite this skill document in a professional format suitable for a knowledge base. Use clear sections, concise language, and structured formatting.",
  prompt: "Rewrite this prompt in a clear, well-structured format. Ensure instructions are precise, well-ordered, and easy to follow.",
  template: "Rewrite this template in a polished, professional format with clear sections, placeholders, and consistent formatting.",
};
export interface WorksheetEditorHandle {
  setContent: (html: string) => void;
  getHTML: () => string;
  setTitle: (title: string) => void;
  setDocumentType: (type: DocumentType) => void;
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
        Table.configure({ resizable: true }),
        TableRow,
        TableCell,
        TableHeader,
        Link.configure({ openOnClick: false, HTMLAttributes: { class: "text-primary underline cursor-pointer" } }),
        CrmBadgeNode,
        SlashCommandExtension,
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
          syncWorksheetEntities(worksheetId, json as unknown as Json).catch(console.error);
        }, 500);
      },
    });

    // Expose editor handle via callback ref
    useEffect(() => {
      if (editorRef && editor) {
        editorRef.current = {
          setContent: (html: string) => editor.commands.setContent(html),
          getHTML: () => editor.getHTML(),
          setTitle: (t: string) => setTitle(t),
          setDocumentType: (dt: DocumentType) => setDocumentType(dt),
        };
      }
    }, [editor, editorRef]);

    // Sync title from props when initialTitle changes (e.g. page reload / query refetch)
    const prevInitialTitle = useRef(initialTitle);
    useEffect(() => {
      if (initialTitle !== prevInitialTitle.current) {
        prevInitialTitle.current = initialTitle;
        setTitle(initialTitle);
      }
    }, [initialTitle]);

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
        <div className="mb-4 flex items-center gap-2">
          {(!title || title === "Untitled") && (
            <GenerateTitleButton
              worksheetId={worksheetId}
              getContent={() => {
                if (!editor) return "";
                return turndown.turndown(editor.getHTML());
              }}
              onTitleGenerated={(t) => {
                setTitle(t);
                updateWorksheet(worksheetId, { title: t }).catch(console.error);
              }}
            />
          )}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 min-w-0 bg-transparent text-xl sm:text-3xl font-bold text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Untitled"
          />
          <Select value={documentType} onValueChange={handleDocumentTypeChange}>
            <SelectTrigger className="w-[90px] sm:w-[120px] h-8 text-xs shrink-0">
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
        {editor && <EditorToolbar editor={editor} onEnhance={async () => {
          if (!editor) return;
          const content = turndown.turndown(editor.getHTML());
          if (!content.trim()) {
            toast.error("No content to enhance");
            return;
          }
          const typeLabel = documentType.charAt(0).toUpperCase() + documentType.slice(1);
          const prompt = `You are enhancing a "${typeLabel}" worksheet. ${ENHANCE_PROMPTS[documentType]}

IMPORTANT RULES:
- Do NOT add any new information, facts, or details that are not already present.
- Keep the exact same content but paraphrase and restructure it for clarity and professionalism.
- Preserve ALL [[CRM:...]] badges exactly as-is.
- Use markdown formatting (headings, bold, lists, etc.) for better structure.
- Return ONLY the enhanced content using the replace_worksheet_content tool.

Here is the content to enhance:

${content}`;

          const resp = await fetch(CHAT_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              messages: [{ role: "user", content: prompt }],
              worksheetTitle: "",
              worksheetContent: content,
              worksheetType: documentType,
            }),
          });

          if (!resp.ok) throw new Error("Failed to enhance content");
          const choice = await resp.json();
          let enhanced = "";

          if (choice.message?.tool_calls?.length) {
            for (const tc of choice.message.tool_calls) {
              if (tc.function?.name === "replace_worksheet_content") {
                try {
                  const args = JSON.parse(tc.function.arguments);
                  enhanced = args.content || "";
                } catch {}
              }
            }
          }

          if (!enhanced && choice.message?.content) {
            enhanced = choice.message.content;
          }

          if (!enhanced.trim()) {
            toast.error("No enhanced content returned");
            return;
          }

          let html = await marked.parse(enhanced);
          html = html.replace(
            /\[\[CRM:([^:]*):([^:]*):([^\]]*)\]\]/g,
            (_match, entityType, entityId, label) =>
              `<span data-crm-badge="" data-entity-type="${entityType}" data-entity-id="${entityId}" class="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground align-baseline mx-0.5 select-none" contenteditable="false"><span class="text-muted-foreground">[${entityId}] </span><span>${label} </span><span class="text-muted-foreground font-semibold">(${entityType})</span></span>`
          );
          editor.commands.setContent(html);
          const md = turndown.turndown(html);
          const json = editor.getJSON();
          updateWorksheet(worksheetId, {
            content_json: json as unknown as Json,
            content_html: html,
            content_md: md,
          }).catch(console.error);
          toast.success("Content enhanced");
        }} />}
        <div className="relative mt-2">
          {editor && <SelectionToolbar editor={editor} onAskAI={handleAskAI} />}
          <EditorContent editor={editor} />
        </div>
      </div>
    );
};

export default WorksheetEditor;
