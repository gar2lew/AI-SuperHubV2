import { useState } from 'react';
import { Download, Image as ImageIcon, Loader2, Sparkles, X } from 'lucide-react';
import { streamImageGeneration } from '@/lib/providers/puter/image';
import type { NormalizedImageArtifact } from '@/lib/providers/puter/normalize';

const IMAGE_MODELS = ['gpt-image-1', 'dall-e-3', 'flux'];

export function ImageWorkspace() {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState(IMAGE_MODELS[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [history, setHistory] = useState<NormalizedImageArtifact[]>([]);
  const [preview, setPreview] = useState<NormalizedImageArtifact | null>(null);

  const generate = async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setStatus('Queued');
    try {
      for await (const event of streamImageGeneration(prompt.trim(), { model })) {
        if (event.type === 'status') setStatus(event.content === 'done' ? 'Ready' : event.content);
        if (event.type === 'artifact') setHistory((prev) => [event.artifact, ...prev].slice(0, 12));
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Image generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

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
            {IMAGE_MODELS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <button onClick={generate} disabled={!prompt.trim() || isGenerating} className="primary-action" aria-label="Generate image">
            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Generate
          </button>
        </div>
      </div>

      <div className="image-grid">
        {history.length === 0 ? (
          <div className="empty-workspace">
            {isGenerating ? (
              <>
                <div className="image-skeleton" />
                <span>Preparing image artifact...</span>
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
