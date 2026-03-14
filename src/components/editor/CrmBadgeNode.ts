import { Node, mergeAttributes } from "@tiptap/core";

export interface CrmBadgeAttrs {
  entityType: string;
  entityId: string | number;
  label: string;
  metadata: Record<string, unknown>;
}

const ENTITY_SHORT: Record<string, string> = {
  Candidate: "Candidate",
  ClientContact: "Contact",
  ClientCorporation: "Client",
  JobOrder: "Job",
  Lead: "Lead",
  Opportunity: "Opportunity",
};

export const CrmBadgeNode = Node.create({
  name: "crmBadge",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      entityType: { default: "" },
      entityId: { default: "" },
      label: { default: "" },
      metadata: { default: {} },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-crm-badge]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const type = ENTITY_SHORT[node.attrs.entityType] || node.attrs.entityType;
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-crm-badge": "",
        "data-entity-type": node.attrs.entityType,
        "data-entity-id": String(node.attrs.entityId),
        class:
          "inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground align-baseline mx-0.5 select-none",
        contenteditable: "false",
      }),
      [
        "span",
        { class: "text-muted-foreground" },
        `[${node.attrs.entityId}] `,
      ],
      ["span", {}, `${node.attrs.label} `],
      [
        "span",
        { class: "text-muted-foreground font-semibold" },
        `(${type})`,
      ],
    ];
  },
});

export default CrmBadgeNode;
