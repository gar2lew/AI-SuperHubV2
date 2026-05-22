import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Copy, Download, FileCode2, Play, WrapText } from 'lucide-react';
import { useSettingsStore } from '@/store/settingsStore';
import { useWorkstationStore } from '@/store/workstationStore';

interface CodeBlockProps {
  language: string;
  children: string;
  deferHighlight?: boolean;
}

const LARGE_BLOCK_CHAR_LIMIT = 12000;
const COLLAPSIBLE_CHAR_LIMIT = 5000;
const COLLAPSIBLE_LINE_LIMIT = 32;
const EXPANDED_BY_DEFAULT_LIMIT = 9000;
const IMMEDIATE_HIGHLIGHT_CHAR_LIMIT = 1800;
const DEFERRED_HIGHLIGHT_DELAY_MS = 140;

const SyntaxHighlighter = lazy(() => import('./renderers/LazyPrismHighlighter'));

function exceedsLineLimit(source: string, lineLimit: number): boolean {
  let lineCount = 1;

  for (let i = 0; i < source.length; i += 1) {
    if (source.charCodeAt(i) === 10) {
      lineCount += 1;
      if (lineCount > lineLimit) {
        return true;
      }
    }
  }

  return false;
}

export const CodeBlock = memo(function CodeBlock({ language, children, deferHighlight = false }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(children.length <= EXPANDED_BY_DEFAULT_LIMIT);
  const [wrap, setWrap] = useState(false);
  const [shouldHighlight, setShouldHighlight] = useState(
    () => children.length <= IMMEDIATE_HIGHLIGHT_CHAR_LIMIT
  );
  const addWorkflowContext = useWorkstationStore((s) => s.addWorkflowContext);
  const updateCodingWorkspace = useWorkstationStore((s) => s.updateCodingWorkspace);
  const setActiveWorkspace = useSettingsStore((s) => s.setActiveWorkspace);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  const displayLanguage = language || 'text';
  const isLarge = children.length > LARGE_BLOCK_CHAR_LIMIT;
  const isCollapsible = useMemo(
    () => children.length > COLLAPSIBLE_CHAR_LIMIT || exceedsLineLimit(children, COLLAPSIBLE_LINE_LIMIT),
    [children]
  );
  const canHighlight = !deferHighlight && !isLarge && (!isCollapsible || expanded);

  useEffect(() => {
    if (!canHighlight) {
      setShouldHighlight(false);
      return;
    }

    if (children.length <= IMMEDIATE_HIGHLIGHT_CHAR_LIMIT) {
      setShouldHighlight(true);
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let idleId: number | undefined;

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const activateHighlight = () => setShouldHighlight(true);

    if (typeof idleWindow.requestIdleCallback === 'function') {
      idleId = idleWindow.requestIdleCallback(activateHighlight);
    } else {
      timeoutId = setTimeout(activateHighlight, DEFERRED_HIGHLIGHT_DELAY_MS);
    }

    return () => {
      if (idleId !== undefined && typeof idleWindow.cancelIdleCallback === 'function') {
        idleWindow.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };
  }, [canHighlight, children.length]);

  const downloadUrl = useMemo(
    () => `data:text/plain;charset=utf-8,${encodeURIComponent(children)}`,
    [children]
  );

  const openInCoding = useCallback(() => {
    const contextId = addWorkflowContext({
      type: 'code',
      title: `Chat snippet.${displayLanguage}`,
      summary: children,
      sourceWorkspace: 'chat',
      payload: {
        code: children,
        language: displayLanguage,
      },
    });
    if (contextId) {
      updateCodingWorkspace({ selectedArtifactId: contextId });
    }
    setActiveWorkspace('coding');
  }, [addWorkflowContext, children, displayLanguage, setActiveWorkspace, updateCodingWorkspace]);

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
            onClick={openInCoding}
            className="code-tool-button"
            title="Open in Coding"
            aria-label="Open snippet in Coding"
          >
            <FileCode2 size={12} />
            <span>Coding</span>
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
      {!shouldHighlight ? (
        plainCode
      ) : (
        <Suspense fallback={plainCode}>
          <SyntaxHighlighter
            language={displayLanguage}
            wrap={wrap}
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
});
