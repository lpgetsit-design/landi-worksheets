import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import WorkflowLaneView from "./WorkflowLaneView";

const WorkflowLaneNode = Node.create({
  name: "workflowLane",
  group: "block",
  content: "workflowCard+",
  draggable: true,
  selectable: true,
  isolating: true,

  addAttributes() {
    return {
      id: { default: "" },
      title: { default: "Untitled Lane" },
      stageKey: { default: "backlog" },
      wipLimit: { default: 0 },
      colorToken: { default: "" },
      sortMode: { default: "manual" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-workflow-lane]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-workflow-lane": "" }, HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WorkflowLaneView);
  },
});

export default WorkflowLaneNode;
