import { Table } from "@tiptap/extension-table";
import { ReactNodeViewRenderer } from "@tiptap/react";
import DataTableView from "./DataTableView";

const DataTableExtension = Table.extend({
  addNodeView() {
    return ReactNodeViewRenderer(DataTableView, {
      as: "div",
      className: "data-table-nodeview",
      stopEvent: () => false,
    });
  },
});

export default DataTableExtension;
