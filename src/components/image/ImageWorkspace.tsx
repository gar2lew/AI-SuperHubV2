import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Image as ImageIcon, Sparkles, X } from 'lucide-react';
import { streamImageGeneration } from '@/lib/providers/puter/image';
import { CAPABILITY_LABELS } from '@/lib/models/capabilities';
import { getModelMetadata } from '@/lib/models/metadata';
import { modelRegistry } from '@/lib/models/registry';
import type { NormalizedImageArtifact } from '@/lib/providers/puter/normalize';

const DEFAULT_IMAGE_MODEL = 'gpt-image-1-mini';
const IMAGE_HISTORY_KEY = 'ai-superhub-image-artifacts';

export function ImageWorkspace() {
  const [prompt, setPrompt] = useState('');
  const imageModels = useMemo(() => modelRegistry.getByCapability('image'), []);
  const [model, setModel] = useState(imageModels[0]?.id ?? DEFAULT_IMAGE_MODEL);
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<NormalizedImageArtifact[]>(() => readImageHistory());
  const [preview, setPreview] = useState<NormalizedImageArtifact | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const selectedModel = modelRegistry.get(model);

  const generate = async () => {
    if (!prompt.trim() || isGenerating) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsGenerating(true);
    setError(null);
    setStatus('Queued');
    try {
      for await (const event of streamImageGeneration(prompt.trim(), {
        model,
        abortSignal: controller.signal,
      })) {
        if (event.type === 'status') {
          setStatus(event.content === 'done' || event.content === 'aborted' ? 'Ready' : event.content);
        }
        if (event.type === 'artifact') setHistory((prev) => [event.artifact, ...prev].slice(0, 12));
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        setStatus('Ready');
      } else {
        const message = error instanceof Error ? error.message : 'Image generation failed';
        setStatus('Failed');
        setError(message);
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const cancelGeneration = () => {
    abortControllerRef.current?.abort();
    setStatus('Cancelling');
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(IMAGE_HISTORY_KEY, JSON.stringify(history.slice(0, 12)));
    } catch {
      // Image history is a convenience cache; failures should not block generation.
    }
  }, [history]);

  return (
    <section className="workspace-surface">
      <div className="workspace-header">
        <div>
          <h1>Image Workspace</h1>
          <p>Prompt, generate, keep lightweight artifacts.</p>
        </div>
        <span className={`status-pill ${isGenerating ? 'is-active' : ''}`}>{status}</span>
      </div>

      <div className="workspace-control-row">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Describe the image to generate..."
          className="workspace-textarea"
          rows={3}
          aria-label="Image prompt"
        />
        <div className="workspace-actions">
          <select value={model} onChange={(event) => setModel(event.target.value)} className="workspace-select" aria-label="Image model">
            {imageModels.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          {isGenerating ? (
            <button onClick={cancelGeneration} className="icon-action danger" aria-label="Cancel image generation">
              <X size={16} />
            </button>
          ) : (
            <button onClick={generate} disabled={!prompt.trim()} className="primary-action" aria-label="Generate image">
              <Sparkles size={16} />
              Generate
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
        <span className="text-text-secondary">{selectedModel?.label ?? model}</span>
        {selectedModel &&
          getModelMetadata(selectedModel)
            .capabilities.map((capability) => (
              <span key={capability} className="rounded-full border border-border/50 px-1.5 py-0.5">
                {CAPABILITY_LABELS[capability]}
              </span>
            ))}
      </div>

      {error && (
        <div className="control-surface border-error/30 px-3 py-2 text-sm text-error" role="alert">
          {error}
        </div>
      )}

      <div className="image-grid">
        {history.length === 0 ? (
          <div className="empty-workspace">
            {isGenerating ? (
              <>
                <div className="image-skeleton" />
                <span>{status === 'generating' ? 'Generating image...' : 'Preparing image artifact...'}</span>
              </>
            ) : (
              <>
                <ImageIcon size={32} />
                <span>No image artifacts yet</span>
              </>
            )}
          </div>
        ) : (
          history.map((artifact) => (
            <figure key={artifact.id} className="artifact-card">
              <button className="image-preview-button" onClick={() => setPreview(artifact)} aria-label="Open image preview">
                <img src={artifact.url} alt={artifact.prompt || 'Generated artifact'} loading="lazy" />
              </button>
              <figcaption>
                <span>{artifact.prompt}</span>
                <a href={artifact.url} download={`image-${artifact.id}.png`} title="Download image">
                  <Download size={15} />
                </a>
              </figcaption>
            </figure>
          ))
        )}
      </div>

      {preview && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="Generated image preview">
          <button className="lightbox-backdrop" onClick={() => setPreview(null)} aria-label="Close preview" />
          <div className="lightbox-panel">
            <button className="lightbox-close" onClick={() => setPreview(null)} aria-label="Close preview">
              <X size={18} />
            </button>
            <img src={preview.url} alt={preview.prompt || 'Generated artifact preview'} />
            <div className="lightbox-caption">
              <span>{preview.prompt}</span>
              <a href={preview.url} download={`image-${preview.id}.png`}>
                <Download size={15} />
                Download
              </a>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function readImageHistory(): NormalizedImageArtifact[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(IMAGE_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is NormalizedImageArtifact => {
      return (
        item &&
        typeof item === 'object' &&
        item.type === 'image' &&
        typeof item.id === 'string' &&
        typeof item.url === 'string' &&
        typeof item.createdAt === 'number'
      );
    });
  } catch {
    return [];
  }
}
