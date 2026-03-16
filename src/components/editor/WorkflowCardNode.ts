import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import WorkflowCardView from "./WorkflowCardView";

export interface WorkflowCardAttrs {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigneeId: string;
  assigneeLabel: string;
  dueDate: string;
  labels: string;
  createdAt: string;
  updatedAt: string;
  blockedBy: string;
  childTaskIds: string;
  isCollapsed: boolean;
  sourceType: string;
  sourceId: string;
}

const WorkflowCardNode = Node.create({
  name: "workflowCard",
  group: "block",
  content: "inline*",
  draggable: true,
  selectable: true,
  isolating: true,

  addAttributes() {
    return {
      id: { default: "" },
      title: { default: "" },
      description: { default: "" },
      status: { default: "backlog" },
      priority: { default: "medium" },
      assigneeId: { default: "" },
      assigneeLabel: { default: "" },
      dueDate: { default: "" },
      labels: { default: "[]" },
      createdAt: { default: "" },
      updatedAt: { default: "" },
      blockedBy: { default: "[]" },
      childTaskIds: { default: "[]" },
      isCollapsed: { default: false },
      sourceType: { default: "" },
      sourceId: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-workflow-card]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-workflow-card": "" }, HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WorkflowCardView);
  },
});

export default WorkflowCardNode;
