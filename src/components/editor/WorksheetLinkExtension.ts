import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import WorksheetLinkMenu, { type WorksheetLinkMenuRef } from "./WorksheetLinkMenu";

const worksheetLinkSuggestionPluginKey = new PluginKey("worksheetLinkSuggestion");

const WorksheetLinkExtension = Extension.create({
  name: "worksheetLink",

  addOptions() {
    return {
      worksheetId: "" as string,
      suggestion: {
        char: "@",
        allowSpaces: true,
        startOfLine: false,
        command: ({ editor, range, props }: { editor: any; range: any; props: any }) => {
          editor.chain().focus().deleteRange(range).run();
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
        },
        render: () => {
          let component: ReactRenderer<WorksheetLinkMenuRef> | null = null;
          let popup: TippyInstance[] | null = null;

          return {
            onStart: (props: any) => {
              component = new ReactRenderer(WorksheetLinkMenu, {
                props: { ...props, excludeId: props.editor.extensionManager.extensions.find((e: any) => e.name === "worksheetLink")?.options?.worksheetId },
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

export default WorksheetLinkExtension;
