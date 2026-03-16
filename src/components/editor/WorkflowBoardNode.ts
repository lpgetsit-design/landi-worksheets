import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import WorkflowBoardView from "./WorkflowBoardView";

const WorkflowBoardNode = Node.create({
  name: "workflowBoard",
  group: "block",
  content: "workflowLane+",
  draggable: true,
  selectable: true,
  isolating: true,

  addAttributes() {
    return {
      id: { default: "" },
      title: { default: "Kanban Board" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-workflow-board]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-workflow-board": "" }, HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WorkflowBoardView);
  },
});

export default WorkflowBoardNode;
