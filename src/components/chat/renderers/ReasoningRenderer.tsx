import { BrainCircuit, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface ReasoningRendererProps {
  reasoning: string;
}

export function ReasoningRenderer({ reasoning }: ReasoningRendererProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="content-card my-2 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-muted hover:text-text-secondary transition-colors"
      >
        <BrainCircuit size={14} />
        <span className="flex-1 text-left">Reasoning</span>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 text-xs text-text-muted font-mono whitespace-pre-wrap leading-relaxed">
          {reasoning}
        </div>
      )}
    </div>
  );
}
