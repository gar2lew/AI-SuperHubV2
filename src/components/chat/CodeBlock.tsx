import { lazy, Suspense, useMemo, useState } from 'react';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Check, ChevronsUpDown, Copy, Download, Play, WrapText } from 'lucide-react';

interface CodeBlockProps {
  language: string;
  children: string;
}

const SyntaxHighlighter = lazy(() =>
  import('react-syntax-highlighter').then((module) => ({ default: module.Prism }))
);

export function CodeBlock({ language, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(children.length <= 9000);
  const [wrap, setWrap] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayLanguage = language || 'text';
  const isLarge = children.length > 12000;
  const isCollapsible = children.split('\n').length > 32 || children.length > 5000;
  const downloadUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(children)}`;
  const plainCode = useMemo(
    () => (
      <pre className={`overflow-x-auto p-4 text-[0.8125rem] leading-relaxed ${wrap ? 'whitespace-pre-wrap' : ''}`}>
        <code>{children}</code>
      </pre>
    ),
    [children, wrap]
  );

  return (
    <div className="code-block code-panel my-3 overflow-hidden">
      {/* Header */}
      <div className="code-toolbar flex items-center justify-between px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-mono text-text-muted uppercase">
            {displayLanguage}
          </span>
          {isLarge && <span className="code-warning">large output</span>}
        </div>
        <div className="flex items-center gap-1">
          {isCollapsible && (
            <button
              onClick={() => setExpanded((value) => !value)}
              className="code-tool-button"
              title={expanded ? 'Collapse code' : 'Expand code'}
              aria-label={expanded ? 'Collapse code block' : 'Expand code block'}
            >
              <ChevronsUpDown size={12} />
              <span>{expanded ? 'Collapse' : 'Expand'}</span>
            </button>
          )}
          <button
            onClick={() => setWrap((value) => !value)}
            className={`code-tool-button ${wrap ? 'is-active' : ''}`}
            title="Toggle line wrapping"
            aria-label="Toggle line wrapping"
          >
            <WrapText size={12} />
            <span>Wrap</span>
          </button>
          <button
            onClick={handleCopy}
            className="code-tool-button"
            title="Copy code"
            aria-label="Copy code"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <a className="code-tool-button" href={downloadUrl} download={`snippet.${displayLanguage}`} title="Download code" aria-label="Download code">
            <Download size={12} />
          </a>
          <button
            className="code-tool-button"
            title="Run code (placeholder)"
            aria-label="Run code placeholder"
          >
            <Play size={12} />
            <span>Run</span>
          </button>
        </div>
      </div>

      {/* Code */}
      <div className={isCollapsible && !expanded ? 'code-collapsed' : undefined}>
      {isLarge ? (
        plainCode
      ) : (
        <Suspense fallback={plainCode}>
          <SyntaxHighlighter
            language={displayLanguage}
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              padding: '1rem',
              background: 'transparent',
              fontSize: '0.8125rem',
              lineHeight: '1.6',
            }}
            codeTagProps={{
              style: {
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                whiteSpace: wrap ? 'pre-wrap' : 'pre',
              },
            }}
          >
            {children}
          </SyntaxHighlighter>
        </Suspense>
      )}
      </div>
      {isCollapsible && !expanded && (
        <button className="code-expand-overlay" onClick={() => setExpanded(true)}>
          Expand full code block
        </button>
      )}
    </div>
  );
}
