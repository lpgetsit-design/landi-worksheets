import { useState, useEffect } from "react";
import { Copy, Check, Link2, Loader2, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "sonner";

interface ShareLink {
  id: string;
  recipient_name: string;
  recipient_email: string | null;
  recipient_company: string | null;
  share_token: string;
  is_active: boolean;
  created_at: string;
  view_count?: number;
}

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worksheetId: string;
  worksheetTitle: string;
}

const generateToken = () => {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
};

const ShareDialog = ({ open, onOpenChange, worksheetId, worksheetTitle }: ShareDialogProps) => {
  const { user } = useAuth();
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");

  const fetchLinks = async () => {
    setLoading(true);
    try {
      const { data: linksData } = await supabase
        .from("public_share_links" as any)
        .select("*")
        .eq("worksheet_id", worksheetId)
        .order("created_at", { ascending: false });

      if (!linksData) { setLinks([]); setLoading(false); return; }

      // Get view counts
      const linkIds = (linksData as any[]).map((l: any) => l.id);
      const { data: views } = await supabase
        .from("share_link_views" as any)
        .select("share_link_id")
        .in("share_link_id", linkIds);

      const viewCounts: Record<string, number> = {};
      (views || []).forEach((v: any) => {
        viewCounts[v.share_link_id] = (viewCounts[v.share_link_id] || 0) + 1;
      });

      setLinks(
        (linksData as any[]).map((l: any) => ({
          ...l,
          view_count: viewCounts[l.id] || 0,
        }))
      );
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchLinks();
  }, [open, worksheetId]);

  const handleCreate = async () => {
    if (!name.trim() || !user) return;
    setCreating(true);
    try {
      const token = generateToken();
      const { error } = await supabase.from("public_share_links" as any).insert({
        worksheet_id: worksheetId,
        created_by: user.id,
        recipient_name: name.trim(),
        recipient_email: email.trim() || null,
        recipient_company: company.trim() || null,
        share_token: token,
      } as any);
      if (error) throw error;

      const shareUrl = `${window.location.origin}/s/${token}`;
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link created and copied to clipboard!");

      setName("");
      setEmail("");
      setCompany("");
      fetchLinks();
    } catch (e: any) {
      toast.error("Failed to create link: " + e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (token: string, id: string) => {
    const url = `${window.location.origin}/s/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggle = async (id: string, currentActive: boolean) => {
    await supabase
      .from("public_share_links" as any)
      .update({ is_active: !currentActive } as any)
      .eq("id", id);
    fetchLinks();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("public_share_links" as any).delete().eq("id", id);
    fetchLinks();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share "{worksheetTitle}"</DialogTitle>
          <DialogDescription>
            Create a public link for a specific recipient. No sign-in required to view.
          </DialogDescription>
        </DialogHeader>

        {/* Create form */}
        <div className="space-y-3 border-b border-border pb-4">
          <div>
            <Label htmlFor="share-name" className="text-xs">Recipient name *</Label>
            <Input
              id="share-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Smith"
              className="mt-1 h-8 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="share-email" className="text-xs">Email</Label>
              <Input
                id="share-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@company.com"
                className="mt-1 h-8 text-sm"
                type="email"
              />
            </div>
            <div>
              <Label htmlFor="share-company" className="text-xs">Company</Label>
              <Input
                id="share-company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Acme Inc"
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            className="w-full gap-1.5"
            size="sm"
          >
            {creating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Link2 className="h-3.5 w-3.5" />
            )}
            Generate & Copy Link
          </Button>
        </div>

        {/* Existing links */}
        <div className="max-h-60 space-y-2 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-4">Loading links...</p>
          ) : links.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No share links yet</p>
          ) : (
            links.map((link) => (
              <div
                key={link.id}
                className={`flex items-center justify-between gap-2 rounded-md border p-2 text-xs ${
                  link.is_active ? "border-border" : "border-border/50 opacity-60"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{link.recipient_name}</p>
                  <p className="text-muted-foreground">
                    {link.view_count || 0} views · {new Date(link.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleCopy(link.share_token, link.id)}
                    title="Copy link"
                  >
                    {copiedId === link.id ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleToggle(link.id, link.is_active)}
                    title={link.is_active ? "Deactivate" : "Activate"}
                  >
                    {link.is_active ? (
                      <ToggleRight className="h-3.5 w-3.5" />
                    ) : (
                      <ToggleLeft className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(link.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareDialog;
