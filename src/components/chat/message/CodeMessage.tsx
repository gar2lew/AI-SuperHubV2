import { CodeBlock } from '../CodeBlock';

interface CodeMessageProps {
  code: string;
  language?: string;
}

export function CodeMessage({ code, language = 'text' }: CodeMessageProps) {
  return (
    <div className="my-2">
      <CodeBlock language={language}>{code}</CodeBlock>
    </div>
  );
}
