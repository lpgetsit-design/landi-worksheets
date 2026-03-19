import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Link from "@tiptap/extension-link";
import { useCallback, useEffect, useRef, useState, useImperativeHandle } from "react";
import TurndownService from "turndown";
import SelectionToolbar from "./SelectionToolbar";
import EditorToolbar from "./EditorToolbar";
import TableEdgeButtons from "./TableEdgeButtons";
import TableControls from "./TableControls";
import CrmBadgeNode from "./CrmBadgeNode";
import WorksheetBadgeNode from "./WorksheetBadgeNode";
import FileBadgeNode from "./FileBadgeNode";
import TableKeyboardShortcuts from "./TableKeyboardShortcuts";
import UnifiedMentionExtension from "./UnifiedMentionExtension";
import { updateWorksheet, syncWorksheetEntities, syncLinkedWorksheets, generateAndSaveSummary, generateAndSaveEmbedding, generateAndSaveKeywords } from "@/lib/worksheets";
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
    const spans = el.querySelectorAll("span");
    let label = "";
    if (spans.length >= 2) {
      label = (spans[1] as HTMLElement).textContent?.trim() || "";
    }
    return `[[CRM:${entityType}:${entityId}:${label}]]`;
  },
});

// Custom Turndown rule: serialize worksheet badge spans into [[WS:id:title]] placeholders
turndown.addRule("worksheetBadge", {
  filter: (node) =>
    node.nodeName === "SPAN" && node.hasAttribute("data-worksheet-badge"),
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const wsId = el.getAttribute("data-worksheet-id") || "";
    const title = el.getAttribute("data-worksheet-title") || el.textContent?.trim() || "";
    return `[[WS:${wsId}:${title}]]`;
  },
});

// Custom Turndown rule: serialize file badge spans into [[FILE:id:title]] placeholders
turndown.addRule("fileBadge", {
  filter: (node) =>
    node.nodeName === "SPAN" && node.hasAttribute("data-file-badge"),
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const attachmentId = el.getAttribute("data-attachment-id") || "";
    const title = el.getAttribute("data-file-title") || el.textContent?.trim() || "";
    return `[[FILE:${attachmentId}:${title}]]`;
  },
});

const STREAM_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stream-ai`;

// ─── Shared SSE streaming helper ───

async function streamFromAI(
  body: { prompt: string; systemPrompt?: string },
  onDelta: (chunk: string) => void,
  onDone: () => void,
  signal?: AbortSignal
) {
  const resp = await fetch(STREAM_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "AI request failed");
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    // Keep the last (possibly incomplete) line in the buffer
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.replace(/\r$/, "");
      if (trimmed.startsWith(":") || trimmed.trim() === "") continue;
      if (!trimmed.startsWith("data: ")) continue;

      const jsonStr = trimmed.slice(6).trim();
      if (jsonStr === "[DONE]") { onDone(); return; }

      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {
        // Incomplete JSON line — put it back for next iteration
        buffer = trimmed + "\n" + buffer;
      }
    }
  }

  // Flush remaining
  if (buffer.trim()) {
    for (let raw of buffer.split("\n")) {
      if (!raw) continue;
      if (raw.endsWith("\r")) raw = raw.slice(0, -1);
      if (raw.startsWith(":") || raw.trim() === "") continue;
      if (!raw.startsWith("data: ")) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch { /* ignore */ }
    }
  }

  onDone();
}

// ─── CRM badge restoration helper ───

function restoreCrmBadges(html: string): string {
  return html.replace(
    /\[\[CRM:([^:]*):([^:]*):([^\]]*)\]\]/g,
    (_match, entityType, entityId, label) =>
      `<span data-crm-badge="" data-entity-type="${entityType}" data-entity-id="${entityId}" class="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground align-baseline mx-0.5 select-none" contenteditable="false"><span class="text-muted-foreground">[${entityId}] </span><span>${label} </span><span class="text-muted-foreground font-semibold">(${entityType})</span></span>`
  );
}

const ENHANCE_PROMPTS: Record<DocumentType, string> = {
  note: "Rewrite this note in a cleaner, well-organized format with proper headings, bullet points, and paragraphs where appropriate.",
  skill: "Rewrite this skill document in a professional format suitable for a knowledge base. Use clear sections, concise language, and structured formatting.",
  prompt: "Rewrite this prompt in a clear, well-structured format. Ensure instructions are precise, well-ordered, and easy to follow.",
  template: "Rewrite this template in a polished, professional format with clear sections, placeholders, and consistent formatting.",
  design: "Rewrite this design document in a structured format with clear sections for goals, requirements, specifications, and visual references.",
};

export interface WorksheetEditorHandle {
  setContent: (html: string) => void;
  getHTML: () => string;
  setTitle: (title: string) => void;
  setDocumentType: (type: DocumentType) => void;
  progressiveReveal: (markdown: string) => Promise<void>;
  insertFileBadge: (attachment: { id: string; file_name: string; file_type: string; title: string }) => void;
}

interface WorksheetEditorProps {
  worksheetId: string;
  initialTitle: string;
  initialContent: Json | null;
  initialDocumentType: DocumentType;
  onSelectionAI?: (text: string, instruction?: string) => void;
  onContentChange?: (text: string) => void;
  onDocumentTypeChange?: (type: DocumentType) => void;
  editorRef?: React.MutableRefObject<WorksheetEditorHandle | null>;
}

const WorksheetEditor = ({ worksheetId, initialTitle, initialContent, initialDocumentType, onSelectionAI, onContentChange, onDocumentTypeChange, editorRef }: WorksheetEditorProps) => {
    const [title, setTitle] = useState(initialTitle);
    const [documentType, setDocumentType] = useState<DocumentType>(initialDocumentType);
    const [isAIEditing, setIsAIEditing] = useState(false);
    const saveTimeout = useRef<ReturnType<typeof setTimeout>>();
    const summaryTimeout = useRef<ReturnType<typeof setTimeout>>();
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => () => { if (summaryTimeout.current) clearTimeout(summaryTimeout.current); }, []);

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
        WorksheetBadgeNode,
        FileBadgeNode,
        UnifiedMentionExtension.configure({ worksheetId }),
        TableKeyboardShortcuts,
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
          syncLinkedWorksheets(worksheetId, json as unknown as Json).catch(console.error);
        }, 500);

        if (summaryTimeout.current) clearTimeout(summaryTimeout.current);
        summaryTimeout.current = setTimeout(() => {
          generateAndSaveSummary(worksheetId, title, md, documentType).catch(console.error);
          generateAndSaveEmbedding(worksheetId, title, md).catch(console.error);
          generateAndSaveKeywords(worksheetId, title, md, documentType).catch(console.error);
        }, 5000);
      },
    });

    // Lock/unlock editor when AI is editing
    useEffect(() => {
      if (editor) {
        editor.setEditable(!isAIEditing);
      }
    }, [isAIEditing, editor]);

    // Progressive reveal for chat panel edits
    const progressiveReveal = useCallback(async (markdown: string) => {
      if (!editor) return;
      setIsAIEditing(true);
      try {
        const chars = markdown.split("");
        let accumulated = "";
        const chunkSize = 50;
        for (let i = 0; i < chars.length; i += chunkSize) {
          accumulated += chars.slice(i, i + chunkSize).join("");
          const html = restoreCrmBadges(await marked.parse(accumulated));
          editor.commands.setContent(html, false, { preserveWhitespace: "full" });
          await new Promise((r) => setTimeout(r, 30));
        }
        // Final set with emitUpdate
        const finalHtml = restoreCrmBadges(await marked.parse(markdown));
        editor.commands.setContent(finalHtml, true, { preserveWhitespace: "full" });
      } finally {
        setIsAIEditing(false);
      }
    }, [editor]);

    // Expose editor handle via callback ref
    useEffect(() => {
      if (editorRef && editor) {
        editorRef.current = {
          setContent: (html: string) => editor.commands.setContent(html, true, { preserveWhitespace: "full" }),
          getHTML: () => editor.getHTML(),
          setTitle: (t: string) => setTitle(t),
          setDocumentType: (dt: DocumentType) => setDocumentType(dt),
          progressiveReveal,
          insertFileBadge: (attachment) => {
            editor.chain().focus().insertContent({
              type: "fileBadge",
              attrs: {
                attachmentId: attachment.id,
                fileName: attachment.file_name,
                fileType: attachment.file_type,
                title: attachment.title || attachment.file_name,
              },
            }).run();
          },
        };
      }
    }, [editor, editorRef, progressiveReveal]);

    // Sync title from props when initialTitle changes
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
      (text: string, instruction?: string) => { onSelectionAI?.(text, instruction); },
      [onSelectionAI]
    );

    const handleDocumentTypeChange = useCallback((value: string) => {
      const newType = value as DocumentType;
      setDocumentType(newType);
      updateWorksheet(worksheetId, { document_type: newType } as any).catch(console.error);
      onDocumentTypeChange?.(newType);
    }, [worksheetId, onDocumentTypeChange]);

    // ─── Streaming Title Generation ───
    const handleGenerateTitle = useCallback(async () => {
      if (!editor || isAIEditing) return;
      const content = turndown.turndown(editor.getHTML());
      if (!content.trim()) {
        setTitle("Untitled");
        return;
      }
      setIsAIEditing(true);
      setTitle("");
      const controller = new AbortController();
      abortRef.current = controller;
      let accumulated = "";
      try {
        await streamFromAI(
          {
            prompt: `Generate a short, concise title (max 6 words, no quotes, no explanations) for this worksheet content:\n\n${content.slice(0, 2000)}`,
            systemPrompt: "You generate concise document titles. Output ONLY the title text, nothing else.",
          },
          (chunk) => {
            accumulated += chunk;
            setTitle(accumulated.replace(/^["']|["']$/g, "").trim());
          },
          () => {
            const finalTitle = accumulated.replace(/^["']|["']$/g, "").trim() || "Untitled";
            setTitle(finalTitle);
            updateWorksheet(worksheetId, { title: finalTitle }).catch(console.error);
          },
          controller.signal
        );
      } catch (e: any) {
        if (e.name !== "AbortError") {
          console.error("Title generation error:", e);
          toast.error("Failed to generate title");
          setTitle(initialTitle || "Untitled");
        }
      } finally {
        setIsAIEditing(false);
        abortRef.current = null;
      }
    }, [editor, isAIEditing, worksheetId, initialTitle]);

    // ─── Streaming Enhance ───
    const handleEnhance = useCallback(async () => {
      if (!editor || isAIEditing) return;
      const content = turndown.turndown(editor.getHTML());
      if (!content.trim()) {
        toast.error("No content to enhance");
        return;
      }
      setIsAIEditing(true);
      const controller = new AbortController();
      abortRef.current = controller;
      let accumulated = "";
      let lastUpdate = 0;

      const typeLabel = documentType.charAt(0).toUpperCase() + documentType.slice(1);
      const prompt = `You are enhancing a "${typeLabel}" worksheet. ${ENHANCE_PROMPTS[documentType]}

IMPORTANT RULES:
- Do NOT add any new information, facts, or details that are not already present.
- Keep the exact same content but paraphrase and restructure it for clarity and professionalism.
- Preserve ALL [[CRM:...]] badges exactly as-is.
- Use markdown formatting (headings, bold, lists, etc.) for better structure.
- Return ONLY the enhanced content, nothing else.

Here is the content to enhance:

${content}`;

      try {
        await streamFromAI(
          { prompt, systemPrompt: "You enhance document content. Output ONLY the enhanced markdown content, no explanations or preamble." },
          (chunk) => {
            accumulated += chunk;
            const now = Date.now();
            if (now - lastUpdate > 200) {
              lastUpdate = now;
              const html = restoreCrmBadges(marked.parse(accumulated, { async: false }) as string);
              editor.commands.setContent(html, false, { preserveWhitespace: "full" });
            }
          },
          () => {
            const finalHtml = restoreCrmBadges(marked.parse(accumulated, { async: false }) as string);
            editor.commands.setContent(finalHtml, true, { preserveWhitespace: "full" });
            const md = turndown.turndown(finalHtml);
            const json = editor.getJSON();
            updateWorksheet(worksheetId, {
              content_json: json as unknown as Json,
              content_html: finalHtml,
              content_md: md,
            }).catch(console.error);
            toast.success("Content enhanced");
          },
          controller.signal
        );
      } catch (e: any) {
        if (e.name !== "AbortError") {
          console.error("Enhance error:", e);
          toast.error("Failed to enhance content");
        }
      } finally {
        setIsAIEditing(false);
        abortRef.current = null;
      }
    }, [editor, isAIEditing, documentType, worksheetId]);

    return (
      <div className="flex flex-col">
        <div className="mb-4 flex items-center gap-2">
          {(!title || title === "Untitled") && !isAIEditing && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleGenerateTitle}
              disabled={isAIEditing}
              title="Generate title from content"
            >
              <Sparkles className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
          {isAIEditing && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          )}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 min-w-0 bg-transparent text-xl sm:text-3xl font-bold text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Untitled"
            disabled={isAIEditing}
          />
        </div>
        {editor && <EditorToolbar editor={editor} onEnhance={handleEnhance} disabled={isAIEditing} />}
        <div className={`relative mt-2 group/table-area transition-opacity ${isAIEditing ? "opacity-70 pointer-events-none" : ""}`}>
          {isAIEditing && (
            <div className="absolute inset-0 z-10 rounded-md border-2 border-primary/30 animate-pulse pointer-events-none" />
          )}
          {editor && <TableControls editor={editor} />}
          {editor && <SelectionToolbar editor={editor} onAskAI={handleAskAI} />}
          {editor && <TableEdgeButtons editor={editor} />}
          <EditorContent editor={editor} />
        </div>
      </div>
    );
};

export default WorksheetEditor;
