const ENTITY_SHORT: Record<string, string> = {
  Candidate: "Candidate",
  ClientContact: "Contact",
  ClientCorporation: "Client",
  JobOrder: "Job",
  Lead: "Lead",
  Opportunity: "Opportunity",
};

interface CrmBadgeInlineProps {
  entityType: string;
  entityId: string;
  label: string;
}

export default function CrmBadgeInline({ entityType, entityId, label }: CrmBadgeInlineProps) {
  const typeLabel = ENTITY_SHORT[entityType] || entityType;
  return (
    <span className="inline-flex max-w-full overflow-hidden items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground align-baseline mx-0.5 select-none">
      <span className="text-muted-foreground shrink-0">[{entityId}]</span>
      <span className="truncate">{label}</span>
      <span className="text-muted-foreground font-semibold shrink-0">({typeLabel})</span>
    </span>
  );
}
