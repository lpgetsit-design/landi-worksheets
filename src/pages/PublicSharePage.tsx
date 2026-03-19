import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";

interface ShareData {
  title: string;
  document_type: string;
  content_html: string | null;
  content_md: string | null;
  design_html: string | null;
  recipient_name: string;
}

const PublicSharePage = () => {
  const { token } = useParams();
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!token) return;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-share?token=${encodeURIComponent(token)}`;
    fetch(url)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load");
        }
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!data?.design_html || !iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(data.design_html);
    doc.close();
  }, [data]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error) {
    const isExpired = error === "Link expired" || error === "Link deactivated";
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-foreground">
        <p className="text-lg font-medium">{isExpired ? "This link has expired" : "Not found"}</p>
        <p className="text-sm text-muted-foreground">
          {isExpired
            ? "The person who shared this content may need to send you a new link."
            : "This share link doesn't exist or has been removed."}
        </p>
      </div>
    );
  }

  if (!data) return null;

  const isDesign = !!data.design_html;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{data.title}</h1>
          <p className="text-xs text-muted-foreground">Shared with {data.recipient_name}</p>
        </div>
      </header>

      {/* Content */}
      {isDesign ? (
        <iframe
          ref={iframeRef}
          className="flex-1 border-0 bg-white"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          title={data.title}
        />
      ) : (
        <div className="mx-auto w-full max-w-[800px] flex-1 px-4 py-8 sm:px-6">
          {data.content_html ? (
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: data.content_html }}
            />
          ) : data.content_md ? (
            <pre className="whitespace-pre-wrap text-sm">{data.content_md}</pre>
          ) : (
            <p className="text-sm text-muted-foreground">This worksheet has no content yet.</p>
          )}
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-border px-4 py-2 text-center text-xs text-muted-foreground">
        Powered by Worksheets
      </footer>
    </div>
  );
};

export default PublicSharePage;
