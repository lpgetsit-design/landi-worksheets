import { useRef, useEffect } from "react";

interface DesignPreviewProps {
  html: string;
}

const DesignPreview = ({ html }: DesignPreviewProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(html || DEFAULT_HTML);
    doc.close();
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      className="w-full h-full border-0 bg-white rounded-md"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      title="Design Preview"
    />
  );
};

const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, -apple-system, sans-serif;
      background: #fafafa;
      color: #888;
    }
    p { font-size: 14px; }
  </style>
</head>
<body>
  <p>Use the AI chat to design your webpage</p>
</body>
</html>`;

export default DesignPreview;
