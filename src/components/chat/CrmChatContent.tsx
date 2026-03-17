import ReactMarkdown from "react-markdown";
import CrmBadgeInline from "./CrmBadgeInline";
import LinkBadgeInline from "./LinkBadgeInline";

const CRM_TOKEN = /\[\[CRM:(\w+):([^\]:]+):([^\]]+)\]\]/g;

interface CrmChatContentProps {
  content: string;
}

export default function CrmChatContent({ content }: CrmChatContentProps) {
  // If no CRM tokens, render plain markdown
  if (!CRM_TOKEN.test(content)) {
    return (
      <ReactMarkdown
        components={{
          a: ({ href, children }) => href ? <LinkBadgeInline href={href}>{children}</LinkBadgeInline> : <a>{children}</a>,
        }}
      >
        {content}
      </ReactMarkdown>
    );
  }
  // Reset regex lastIndex after test()
  CRM_TOKEN.lastIndex = 0;

  // Custom ReactMarkdown component that intercepts text nodes and replaces CRM tokens
  return (
    <ReactMarkdown
      components={{
        // Override the text renderer to parse CRM tokens inside text nodes
        a: ({ href, children }) => {
          if (href) {
            return <LinkBadgeInline href={href}>{children}</LinkBadgeInline>;
          }
          return <a>{children}</a>;
        },
        p: ({ children, ...props }) => <p {...props}>{processChildren(children)}</p>,
        li: ({ children, ...props }) => <li {...props}>{processChildren(children)}</li>,
        td: ({ children, ...props }) => <td {...props}>{processChildren(children)}</td>,
        th: ({ children, ...props }) => <th {...props}>{processChildren(children)}</th>,
        h1: ({ children, ...props }) => <h1 {...props}>{processChildren(children)}</h1>,
        h2: ({ children, ...props }) => <h2 {...props}>{processChildren(children)}</h2>,
        h3: ({ children, ...props }) => <h3 {...props}>{processChildren(children)}</h3>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function processChildren(children: React.ReactNode): React.ReactNode {
  if (!children) return children;
  if (typeof children === "string") return replaceTokens(children);
  if (Array.isArray(children)) return children.map((c, i) => (typeof c === "string" ? <span key={i}>{replaceTokens(c)}</span> : c));
  return children;
}

function replaceTokens(text: string): React.ReactNode {
  const regex = /\[\[CRM:(\w+):([^\]:]+):([^\]]+)\]\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <CrmBadgeInline
        key={key++}
        entityType={match[1]}
        entityId={match[2]}
        label={match[3]}
      />
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}
