import ReactMarkdown from 'react-markdown';
import { CodeBlock } from '../CodeBlock';

interface TextMessageProps {
  text: string;
}

export function TextMessage({ text }: TextMessageProps) {
  return (
    <div className="markdown-content text-sm leading-relaxed">
      <ReactMarkdown
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            const isInline = !className;

            if (isInline) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }

            return (
              <CodeBlock language={language}>
                {String(children).replace(/\n$/, '')}
              </CodeBlock>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
