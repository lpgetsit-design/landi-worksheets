import type { Editor } from "@tiptap/core";

const DEFAULT_STAGE_KEYS = ["backlog", "in_progress", "review", "done", "ready", "blocked"];
const DEFAULT_STAGE_TITLES: Record<string, string> = {
  backlog: "Backlog",
  ready: "Ready",
  in_progress: "In Progress",
  blocked: "Blocked",
  review: "Review",
  done: "Done",
};

export const insertWorkflowBoard = (
  editor: Editor,
  laneCount = 3
) => {
  const boardId = crypto.randomUUID();
  const now = new Date().toISOString();
  const count = Math.max(1, Math.min(laneCount, 6));

  const lanes = Array.from({ length: count }, (_, i) => {
    const stageKey = DEFAULT_STAGE_KEYS[i % DEFAULT_STAGE_KEYS.length];
    return {
      type: "workflowLane",
      attrs: {
        id: crypto.randomUUID(),
        title: DEFAULT_STAGE_TITLES[stageKey] || "Lane",
        stageKey,
      },
      content: [
        {
          type: "workflowCard",
          attrs: {
            id: crypto.randomUUID(),
            title: "",
            status: stageKey,
            createdAt: now,
            updatedAt: now,
          },
          content: [{ type: "text", text: "New card" }],
        },
      ],
    };
  });

  editor
    .chain()
    .focus()
    .insertContent({
      type: "workflowBoard",
      attrs: { id: boardId, title: "Kanban Board" },
      content: lanes,
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
