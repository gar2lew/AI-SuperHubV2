import { lazy, Suspense, useMemo, useState } from 'react';
import { Check, Copy, Download, FileCode2, MessageSquare, Play, TerminalSquare, WrapText } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useWorkstationStore } from '@/store/workstationStore';

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
  const savedState = useWorkstationStore((s) => s.codingWorkspace);
  const workflowContexts = useWorkstationStore((s) => s.workflowContexts);
  const updateCodingWorkspace = useWorkstationStore((s) => s.updateCodingWorkspace);
  const updateTerminalWorkspace = useWorkstationStore((s) => s.updateTerminalWorkspace);
  const addWorkflowContext = useWorkstationStore((s) => s.addWorkflowContext);
  const setActiveWorkspace = useSettingsStore((s) => s.setActiveWorkspace);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const createConversation = useChatStore((s) => s.createConversation);
  const [artifacts, setArtifacts] = useState<CodeArtifact[]>([SAMPLE]);
  const [selectedId, setSelectedId] = useState(savedState.selectedArtifactId ?? SAMPLE.id);
  const [status, setStatus] = useState('Sandbox idle');
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(savedState.wrap);
  const workflowArtifacts = useMemo<CodeArtifact[]>(
    () => workflowContexts
      .filter((context) => context.type === 'code' && context.payload.code)
      .map((context) => ({
        id: context.id,
        name: context.title.endsWith(`.${context.payload.language}`) ? context.title : `${context.title}.${context.payload.language || 'txt'}`,
        language: context.payload.language || 'text',
        code: context.payload.code || '',
      })),
    [workflowContexts]
  );
  const allArtifacts = useMemo(
    () => {
      const seen = new Set<string>();
      return [...workflowArtifacts, ...artifacts].filter((artifact) => {
        if (seen.has(artifact.id)) return false;
        seen.add(artifact.id);
        return true;
      });
    },
    [artifacts, workflowArtifacts]
  );
  const selected = useMemo(
    () => allArtifacts.find((artifact) => artifact.id === selectedId) || allArtifacts[0],
    [allArtifacts, selectedId]
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
    updateCodingWorkspace({ selectedArtifactId: artifact.id });
  };

  const copy = async () => {
    await navigator.clipboard.writeText(selected.code);
    setCopied(true);
    setStatus('Copied');
    setTimeout(() => setCopied(false), 1600);
  };

  const sendSnippetToChat = () => {
    addWorkflowContext({
      type: 'code',
      title: selected.name,
      summary: `${selected.language} snippet from Coding`,
      sourceWorkspace: 'coding',
      payload: {
        code: selected.code,
        language: selected.language,
      },
    }, { attach: true });
    if (!activeConversationId) {
      createConversation();
    }
    setActiveWorkspace('chat');
    setStatus('Attached to chat');
  };

  const openSnippetInTerminal = () => {
    addWorkflowContext({
      type: 'code',
      title: selected.name,
      summary: 'Code snippet opened from Coding workspace',
      sourceWorkspace: 'coding',
      payload: {
        code: selected.code,
        language: selected.language,
      },
    });
    updateTerminalWorkspace({ input: `run ${selected.name}` });
    setActiveWorkspace('terminal');
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
          {allArtifacts.map((artifact) => (
            <button
              key={artifact.id}
              onClick={() => {
                setSelectedId(artifact.id);
                updateCodingWorkspace({ selectedArtifactId: artifact.id });
              }}
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
              <button
                onClick={sendSnippetToChat}
                title="Send snippet to Chat"
                aria-label="Send snippet to Chat"
              >
                <MessageSquare size={15} />
              </button>
              <button
                onClick={openSnippetInTerminal}
                title="Open snippet in Terminal"
                aria-label="Open snippet in Terminal"
              >
                <TerminalSquare size={15} />
              </button>
              <button
                onClick={() => {
                  setWrap((value) => {
                    updateCodingWorkspace({ wrap: !value });
                    return !value;
                  });
                }}
                title="Toggle line wrapping"
                aria-label="Toggle line wrapping"
                className={wrap ? 'is-active' : ''}
              >
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
