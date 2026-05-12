import { Box, Download, ExternalLink } from 'lucide-react';

interface ArtifactRendererProps {
  name: string;
  type: string;
  content?: string;
  url?: string;
}

export function ArtifactRenderer({ name, type, content, url }: ArtifactRendererProps) {
  return (
    <div className="content-card my-2 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Box size={16} className="text-accent" />
        <span className="text-sm font-medium text-text-primary">{name}</span>
        <span className="kbd-token text-[10px] px-1.5 py-0.5 text-text-muted uppercase">
          {type}
        </span>
      </div>
      {content && (
        <pre className="code-inline-preview text-xs text-text-secondary font-mono p-2 max-h-40 overflow-auto">
          {content.slice(0, 500)}
          {content.length > 500 && '...'}
        </pre>
      )}
      {url && (
        <div className="flex gap-2 mt-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover"
          >
            <ExternalLink size={12} />
            Open
          </a>
          <a
            href={url}
            download={name}
            className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover"
          >
            <Download size={12} />
            Download
          </a>
        </div>
      )}
    </div>
  );
}
