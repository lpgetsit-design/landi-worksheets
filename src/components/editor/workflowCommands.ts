import type { Editor } from "@tiptap/core";

export const insertWorkflowLane = (
  editor: Editor,
  title = "Backlog",
  stageKey = "backlog"
) => {
  const id = crypto.randomUUID();
  const cardId = crypto.randomUUID();
  const now = new Date().toISOString();

  editor
    .chain()
    .focus()
    .insertContent({
      type: "workflowLane",
      attrs: { id, title, stageKey },
      content: [
        {
          type: "workflowCard",
          attrs: {
            id: cardId,
            title: "",
            status: stageKey,
            createdAt: now,
            updatedAt: now,
          },
          content: [{ type: "text", text: "New card" }],
        },
      ],
    })
    .run();
};

export const insertWorkflowCard = (editor: Editor) => {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  editor
    .chain()
    .focus()
    .insertContent({
      type: "workflowCard",
      attrs: {
        id,
        title: "",
        status: "backlog",
        createdAt: now,
        updatedAt: now,
      },
      content: [{ type: "text", text: "New card" }],
    })
    .run();
};
