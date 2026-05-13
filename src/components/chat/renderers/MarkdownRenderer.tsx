import { memo, useDeferredValue, useMemo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import { CodeBlock } from '../CodeBlock';

interface MarkdownRendererProps {
  text: string;
}

const CODE_LANGUAGE_PATTERN = /language-([a-z0-9_+-]+)/i;

function extractCodeText(children: ReactNode): string {
  if (children == null) {
    return '';
  }

  const value = typeof children === 'string' ? children : String(children);
  return value.endsWith('\n') ? value.slice(0, -1) : value;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({ text }: MarkdownRendererProps) {
  const deferredText = useDeferredValue(text);
  const components = useMemo(
    () => ({
      code({ className, children, ...props }: { className?: string; children?: ReactNode }) {
        const match = className ? CODE_LANGUAGE_PATTERN.exec(className) : null;
        const language = match ? match[1] : '';
        const isInline = !className;

        if (isInline) {
          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        }

        return <CodeBlock language={language}>{extractCodeText(children)}</CodeBlock>;
      },
    }),
    []
  );

  return (
    <div className="markdown-content text-sm leading-relaxed">
      <ReactMarkdown components={components}>
        {deferredText}
      </ReactMarkdown>
    </div>
  );
}, (previous, next) => previous.text === next.text);
