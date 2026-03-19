import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import FileBadgeView from "./FileBadgeView";

export const FileBadgeNode = Node.create({
  name: "fileBadge",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      attachmentId: { default: "" },
      fileName: { default: "" },
      fileType: { default: "" },
      title: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-file-badge]",
        getAttrs: (node: HTMLElement) => ({
          attachmentId: node.getAttribute("data-attachment-id") || "",
          fileName: node.getAttribute("data-file-name") || "",
          fileType: node.getAttribute("data-file-type") || "",
          title: node.getAttribute("data-file-title") || node.textContent?.trim() || "",
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-file-badge": "",
        "data-attachment-id": node.attrs.attachmentId,
        "data-file-name": node.attrs.fileName,
        "data-file-type": node.attrs.fileType,
        "data-file-title": node.attrs.title,
        class:
          "inline-flex max-w-full overflow-hidden items-center gap-1 rounded border border-border bg-accent/50 px-1.5 py-0.5 text-xs font-medium text-foreground align-baseline mx-0.5 select-none",
        contenteditable: "false",
      }),
      ["span", { class: "text-muted-foreground" }, "📎"],
      ["span", {}, node.attrs.title || node.attrs.fileName],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileBadgeView, { as: "span" });
  },
});

export default FileBadgeNode;
