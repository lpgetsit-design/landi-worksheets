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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  variant?: "ghost" | "outline";
  destructive?: boolean;
}) => (
  <Button
    variant={variant}
    size="icon"
    className={cn(
      "h-7 w-7",
      destructive && "text-destructive hover:bg-destructive/10 hover:text-destructive"
    )}
    onClick={onClick}
    title={title}
    type="button"
  >
    {children}
  </Button>
);

const TableControls = ({ editor }: TableControlsProps) => {
  if (!editor.isActive("table")) return null;

  const canMerge = editor.can().mergeCells();
  const canSplit = editor.can().splitCell();

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border bg-muted/50 px-1 py-0.5 mb-1 text-xs animate-in fade-in slide-in-from-top-1 duration-150">
      <span className="text-muted-foreground text-[10px] font-medium px-1 select-none">Table</span>
      <span className="text-muted-foreground/60 text-[9px] px-0.5 select-none hidden sm:inline">⌘↵ add row</span>

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      <TinyButton
        onClick={() => editor.chain().focus().addRowBefore().run()}
        title="Add row above (Ctrl+Shift+↑)"
      >
        <ArrowUpFromLine className="h-3.5 w-3.5" />
      </TinyButton>
      <TinyButton
        onClick={() => editor.chain().focus().addRowAfter().run()}
        title="Add row below (Ctrl+Enter)"
      >
        <ArrowDownFromLine className="h-3.5 w-3.5" />
      </TinyButton>
      <TinyButton
        onClick={() => editor.chain().focus().addColumnBefore().run()}
        title="Add column left"
      >
        <ArrowLeftFromLine className="h-3.5 w-3.5" />
      </TinyButton>
      <TinyButton
        onClick={() => editor.chain().focus().addColumnAfter().run()}
        title="Add column right"
      >
        <ArrowRightFromLine className="h-3.5 w-3.5" />
      </TinyButton>

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      <TinyButton
        onClick={() => editor.chain().focus().deleteRow().run()}
        title="Delete row"
        destructive
      >
        <Minus className="h-3.5 w-3.5" />
      </TinyButton>
      <TinyButton
        onClick={() => editor.chain().focus().deleteColumn().run()}
        title="Delete column"
        destructive
      >
        <Minus className="h-3.5 w-3.5 rotate-90" />
      </TinyButton>

      {(canMerge || canSplit) && (
        <>
          <Separator orientation="vertical" className="mx-0.5 h-5" />
          {canMerge && (
            <TinyButton
              onClick={() => editor.chain().focus().mergeCells().run()}
              title="Merge cells"
            >
              <Merge className="h-3.5 w-3.5" />
            </TinyButton>
          )}
          {canSplit && (
            <TinyButton
              onClick={() => editor.chain().focus().splitCell().run()}
              title="Split cell"
            >
              <SplitSquareVertical className="h-3.5 w-3.5" />
            </TinyButton>
          )}
        </>
      )}

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      <TinyButton
        onClick={() => editor.chain().focus().deleteTable().run()}
        title="Delete table"
        destructive
      >
        <Trash2 className="h-3.5 w-3.5" />
      </TinyButton>
    </div>
  );
};

export default TableControls;
