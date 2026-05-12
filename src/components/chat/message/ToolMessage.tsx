import { Wrench, CheckCircle, XCircle } from 'lucide-react';

interface ToolMessageProps {
  toolId: string;
  status: 'pending' | 'success' | 'error';
  result?: string;
}

export function ToolMessage({ toolId, status, result }: ToolMessageProps) {
  const statusIcon = {
    pending: <Wrench size={14} className="text-warning animate-pulse" />,
    success: <CheckCircle size={14} className="text-success" />,
    error: <XCircle size={14} className="text-error" />,
  };

  return (
    <div className="content-card my-2 p-3">
      <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
        {statusIcon[status]}
        <span className="font-mono">{toolId}</span>
      </div>
      {result && (
        <div className="text-sm text-text-secondary mt-1">
          {result}
        </div>
      )}
    </div>
  );
}
