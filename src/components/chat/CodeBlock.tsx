import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, Play } from 'lucide-react';

interface CodeBlockProps {
  language: string;
  children: string;
}

export function CodeBlock({ language, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayLanguage = language || 'text';

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-border-subtle bg-code-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-bg-elevated/50 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-text-muted uppercase">
            {displayLanguage}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            title="Copy code"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            title="Run code (placeholder)"
          >
            <Play size={12} />
            <span>Run</span>
          </button>
        </div>
      </div>

      {/* Code */}
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
          },
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}
