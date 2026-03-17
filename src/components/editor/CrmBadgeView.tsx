import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { X } from "lucide-react";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, Building2, MapPin, Briefcase, User } from "lucide-react";

const ENTITY_SHORT: Record<string, string> = {
  Candidate: "Candidate",
  ClientContact: "Contact",
  ClientCorporation: "Client",
  JobOrder: "Job",
  Lead: "Lead",
  Opportunity: "Opportunity",
};

interface MetadataField {
  key: string;
  label: string;
  icon: React.ReactNode;
}

const FIELD_MAP: MetadataField[] = [
  { key: "email", label: "Email", icon: <Mail className="h-3.5 w-3.5 text-muted-foreground" /> },
  { key: "email1", label: "Email", icon: <Mail className="h-3.5 w-3.5 text-muted-foreground" /> },
  { key: "phone", label: "Phone", icon: <Phone className="h-3.5 w-3.5 text-muted-foreground" /> },
  { key: "phone1", label: "Phone", icon: <Phone className="h-3.5 w-3.5 text-muted-foreground" /> },
  { key: "mobile", label: "Mobile", icon: <Phone className="h-3.5 w-3.5 text-muted-foreground" /> },
  { key: "companyName", label: "Company", icon: <Building2 className="h-3.5 w-3.5 text-muted-foreground" /> },
  { key: "clientCorporation", label: "Company", icon: <Building2 className="h-3.5 w-3.5 text-muted-foreground" /> },
  { key: "occupation", label: "Title", icon: <Briefcase className="h-3.5 w-3.5 text-muted-foreground" /> },
  { key: "title", label: "Title", icon: <Briefcase className="h-3.5 w-3.5 text-muted-foreground" /> },
  { key: "address", label: "Location", icon: <MapPin className="h-3.5 w-3.5 text-muted-foreground" /> },
  { key: "status", label: "Status", icon: <User className="h-3.5 w-3.5 text-muted-foreground" /> },
];

function formatAddress(addr: unknown): string | null {
  if (!addr || typeof addr !== "object") return null;
  const a = addr as Record<string, string>;
  const parts = [a.city, a.state, a.countryName || a.countryCode].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function resolveValue(meta: Record<string, unknown>, key: string): string | null {
  const val = meta[key];
  if (val == null) return null;
  if (key === "address") return formatAddress(val);
  if (key === "clientCorporation" && typeof val === "object") {
    return (val as Record<string, unknown>).name as string || null;
  }
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

export default function CrmBadgeView({ node, editor, getPos }: NodeViewProps) {
  const { entityType, entityId, label, metadata } = node.attrs;
  const typeLabel = ENTITY_SHORT[entityType] || entityType;
  const meta = (metadata || {}) as Record<string, unknown>;

  const fields: { label: string; icon: React.ReactNode; value: string }[] = [];
  const seen = new Set<string>();

  for (const f of FIELD_MAP) {
    if (seen.has(f.label)) continue;
    const val = resolveValue(meta, f.key);
    if (val) {
      seen.add(f.label);
      fields.push({ label: f.label, icon: f.icon, value: val });
    }
  }

  return (
    <NodeViewWrapper as="span" className="inline">
      <HoverCard openDelay={200} closeDelay={100}>
        <HoverCardTrigger asChild>
          <span
            className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground align-baseline mx-0.5 select-none cursor-default max-w-full overflow-hidden"
            contentEditable={false}
          >
            <span className="text-muted-foreground shrink-0">[{entityId}]</span>
            <span className="truncate">{label}</span>
            <span className="text-muted-foreground font-semibold shrink-0">({typeLabel})</span>
          </span>
        </HoverCardTrigger>
        <HoverCardContent
          side="top"
          align="start"
          className="w-72 p-0 overflow-hidden"
        >
          <div className="border-b border-border bg-muted/50 px-4 py-3 flex items-center justify-between">
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
              {typeLabel}
            </Badge>
            <span className="text-xs text-muted-foreground font-mono">#{entityId}</span>
          </div>
          <div className="px-4 py-3 space-y-3">
            <p className="text-sm font-semibold text-foreground leading-tight">{label}</p>
            {fields.length > 0 && (
              <div className="space-y-2">
                {fields.map((f) => (
                  <div key={f.label} className="flex items-start gap-2 text-xs">
                    <span className="mt-0.5 shrink-0">{f.icon}</span>
                    <span className="text-foreground break-all">{f.value}</span>
                  </div>
                ))}
              </div>
            )}
            {fields.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No additional details available</p>
            )}
          </div>
        </HoverCardContent>
      </HoverCard>
    </NodeViewWrapper>
  );
}
