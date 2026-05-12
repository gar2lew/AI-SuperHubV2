import { Image as ImageIcon } from 'lucide-react';

interface VisionMessageProps {
  url?: string;
  file?: File;
  alt?: string;
}

export function VisionMessage({ url, file, alt }: VisionMessageProps) {
  const src = url || (file ? URL.createObjectURL(file) : undefined);

  if (!src) {
    return (
      <div className="content-card my-2 p-4 flex items-center gap-2 text-text-muted">
        <ImageIcon size={18} />
        <span className="text-sm">Image unavailable</span>
      </div>
    );
  }

  return (
    <div className="my-2">
      <img
        src={src}
        alt={alt || 'Uploaded image'}
        className="vision-artifact max-w-full max-h-80 object-contain"
        loading="lazy"
      />
    </div>
  );
}
