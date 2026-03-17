import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import UnifiedMentionMenu, { type UnifiedMentionMenuRef } from "./UnifiedMentionMenu";

const UnifiedMentionExtension = Extension.create({
  name: "unifiedMention",

  addOptions() {
    return {
      worksheetId: "" as string,
      suggestion: {
        char: "@",
        allow: ({ state, range }: { state: any; range: any }) => {
          const from = range.from;
          const textBefore = state.doc.textBetween(Math.max(0, from - 2), from, "\n");
          // Only trigger after whitespace, newline, or at start of doc
          return textBefore.length <= 1 || /[\s\n]/.test(textBefore.charAt(textBefore.length - 2));
        },
        allowSpaces: true,
        startOfLine: false,
        command: ({ editor, range, props }: { editor: any; range: any; props: any }) => {
          editor.chain().focus().deleteRange(range).run();

          if (props._type === "crm") {
            editor
              .chain()
              .focus()
              .insertContent({
                type: "crmBadge",
                attrs: {
                  entityType: props.entityType,
                  entityId: props.entityId,
                  label: props.label,
                  metadata: props.metadata,
                },
              })
              .run();
          } else if (props._type === "worksheet") {
            editor
              .chain()
              .focus()
              .insertContent({
                type: "worksheetBadge",
                attrs: {
                  worksheetId: props.worksheetId,
                  title: props.title,
                },
              })
              .run();
          }
        },
        render: () => {
          let component: ReactRenderer<UnifiedMentionMenuRef> | null = null;
          let popup: TippyInstance[] | null = null;

          return {
            onStart: (props: any) => {
              const wsId = props.editor.extensionManager.extensions.find(
                (e: any) => e.name === "unifiedMention"
              )?.options?.worksheetId;

              component = new ReactRenderer(UnifiedMentionMenu, {
                props: { ...props, excludeWorksheetId: wsId },
                editor: props.editor,
              });

              if (!props.clientRect) return;

              popup = tippy("body", {
                getReferenceClientRect: props.clientRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
              });
            },
            onUpdate: (props: any) => {
              component?.updateProps(props);
              if (popup && props.clientRect) {
                popup[0]?.setProps({
                  getReferenceClientRect: props.clientRect,
                });
              }
            },
            onKeyDown: (props: any) => {
              if (props.event.key === "Escape") {
                popup?.[0]?.hide();
                return true;
              }
              return component?.ref?.onKeyDown(props.event) ?? false;
            },
            onExit: () => {
              popup?.[0]?.destroy();
              component?.destroy();
            },
          };
        },
      } satisfies Partial<SuggestionOptions>,
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

export default UnifiedMentionExtension;
