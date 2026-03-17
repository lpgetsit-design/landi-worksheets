import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import WorksheetBadgeView from "./WorksheetBadgeView";

export interface WorksheetBadgeAttrs {
  worksheetId: string;
  title: string;
}

export const WorksheetBadgeNode = Node.create({
  name: "worksheetBadge",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      worksheetId: { default: "" },
      title: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-worksheet-badge]",
        getAttrs: (node: HTMLElement) => ({
          worksheetId: node.getAttribute("data-worksheet-id") || "",
          title: node.getAttribute("data-worksheet-title") || node.textContent?.trim() || "",
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-worksheet-badge": "",
        "data-worksheet-id": node.attrs.worksheetId,
        "data-worksheet-title": node.attrs.title,
        class:
          "inline-flex max-w-full overflow-hidden items-center gap-1 rounded border border-border bg-accent/50 px-1.5 py-0.5 text-xs font-medium text-foreground align-baseline mx-0.5 select-none",
        contenteditable: "false",
      }),
      ["span", { class: "text-muted-foreground" }, "📄"],
      ["span", {}, node.attrs.title],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WorksheetBadgeView, { as: "span" });
  },
});

export default WorksheetBadgeNode;
