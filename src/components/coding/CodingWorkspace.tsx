import { lazy, Suspense, useMemo, useState } from 'react';
import { Check, Copy, Download, FileCode2, Play, WrapText } from 'lucide-react';

interface CodeArtifact {
  id: string;
  name: string;
  language: string;
  code: string;
}

const SAMPLE: CodeArtifact = {
  id: 'artifact-runtime-hook',
  name: 'runtime-hook.ts',
  language: 'ts',
  code: `export function createRuntimeHook() {\n  return {\n    execute: async () => 'Provider-ready sandbox hook',\n  };\n}`,
};

const LazyCodeViewport = lazy(() =>
  import('./LazyCodeViewport').then((module) => ({ default: module.LazyCodeViewport }))
);

export function CodingWorkspace() {
  const [artifacts, setArtifacts] = useState<CodeArtifact[]>([SAMPLE]);
  const [selectedId, setSelectedId] = useState(SAMPLE.id);
  const [status, setStatus] = useState('Sandbox idle');
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(false);
  const selected = useMemo(
    () => artifacts.find((artifact) => artifact.id === selectedId) || artifacts[0],
    [artifacts, selectedId]
  );

  const createArtifact = () => {
    const artifact: CodeArtifact = {
      id: `artifact-${Date.now().toString(36)}`,
      name: `snippet-${artifacts.length + 1}.ts`,
      language: 'ts',
      code: 'export const value = "generated artifact";\n',
    };
    setArtifacts((prev) => [artifact, ...prev]);
    setSelectedId(artifact.id);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(selected.code);
    setCopied(true);
    setStatus('Copied');
    setTimeout(() => setCopied(false), 1600);
  };

  const downloadUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(selected.code)}`;

  return (
    <section className="workspace-surface coding-surface">
      <div className="workspace-header">
        <div>
          <h1>Coding Workspace</h1>
          <p>Code artifacts, optimized rendering, and future run hooks.</p>
        </div>
        <button onClick={createArtifact} className="secondary-action">
          <FileCode2 size={16} />
          New artifact
        </button>
      </div>

      <div className="coding-layout">
        <aside className="artifact-list" aria-label="Code artifacts">
          {artifacts.map((artifact) => (
            <button
              key={artifact.id}
              onClick={() => setSelectedId(artifact.id)}
              className={artifact.id === selected.id ? 'is-active' : ''}
              aria-current={artifact.id === selected.id}
            >
              <FileCode2 size={15} />
              <span>{artifact.name}</span>
            </button>
          ))}
        </aside>

        <div className="code-panel">
          <div className="code-toolbar">
            <span>{selected.name}</span>
            <div>
              <button onClick={() => setWrap((value) => !value)} title="Toggle line wrapping" aria-label="Toggle line wrapping" className={wrap ? 'is-active' : ''}>
                <WrapText size={15} />
              </button>
              <button onClick={copy} title="Copy code" aria-label="Copy code">
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
              <a href={downloadUrl} download={selected.name} title="Download code" aria-label="Download code">
                <Download size={15} />
              </a>
              <button onClick={() => setStatus('Mock sandbox hook invoked')} title="Run snippet" aria-label="Run mock snippet hook">
                <Play size={15} />
              </button>
            </div>
          </div>
          {selected.code.length > 8000 && <div className="code-size-warning">Large artifact: highlighting and wrapping are optimized for stability.</div>}
          <Suspense
            fallback={
              <pre className={`code-scroll ${wrap ? 'whitespace-pre-wrap' : ''}`}>
                <code>Loading editor...</code>
              </pre>
            }
          >
            <LazyCodeViewport code={selected.code} wrap={wrap} />
          </Suspense>
          <div className="code-status">{status}</div>
        </div>
      </div>
    </section>
  );
}
