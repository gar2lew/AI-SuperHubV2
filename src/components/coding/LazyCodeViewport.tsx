interface LazyCodeViewportProps {
  code: string;
  wrap: boolean;
}

export function LazyCodeViewport({ code, wrap }: LazyCodeViewportProps) {
  return (
    <pre className={`code-scroll ${wrap ? 'whitespace-pre-wrap' : ''}`}>
      <code>{code}</code>
    </pre>
  );
}
