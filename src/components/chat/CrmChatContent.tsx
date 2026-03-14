import ReactMarkdown from "react-markdown";
import CrmBadgeInline from "./CrmBadgeInline";

const CRM_REGEX = /\[\[CRM:(\w+):(\d+):([^\]]+)\]\]/g;

interface CrmChatContentProps {
  content: string;
}

export default function CrmChatContent({ content }: CrmChatContentProps) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = CRM_REGEX.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <ReactMarkdown key={key++}>{content.slice(lastIndex, match.index)}</ReactMarkdown>
      );
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

  if (lastIndex < content.length) {
    parts.push(<ReactMarkdown key={key++}>{content.slice(lastIndex)}</ReactMarkdown>);
  }

  return <>{parts}</>;
}
