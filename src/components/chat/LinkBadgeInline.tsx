import { ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";

interface LinkBadgeInlineProps {
  href: string;
  children: React.ReactNode;
}

// Simple in-memory cache for fetched titles
const titleCache = new Map<string, string>();

export default function LinkBadgeInline({ href, children }: LinkBadgeInlineProps) {
  const childText = typeof children === "string" ? children : extractText(children);
  const [title, setTitle] = useState<string>(childText || href);

  useEffect(() => {
    // If the markdown already has a label different from the raw URL, use it
    if (childText && childText !== href) {
      setTitle(childText);
      return;
    }

    // Check cache
    if (titleCache.has(href)) {
      setTitle(titleCache.get(href)!);
      return;
    }

    // Fetch the page title
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(
          `https://corsproxy.io/?${encodeURIComponent(href)}`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (!resp.ok) return;
        const html = await resp.text();
        const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (match && !cancelled) {
          const pageTitle = match[1].trim();
          titleCache.set(href, pageTitle);
          setTitle(pageTitle);
        }
      } catch {
        // Keep the fallback title
      }
    })();

    return () => { cancelled = true; };
  }, [href, childText]);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground align-baseline mx-0.5 no-underline hover:bg-accent transition-colors"
    >
      <span className="truncate max-w-[200px]">{title}</span>
      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
    </a>
  );
}

function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object" && "props" in node) {
    return extractText((node as any).props.children);
  }
  return "";
}
