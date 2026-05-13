import { memo, useMemo } from 'react';
import { CodeBlock } from '../CodeBlock';

interface StreamingTextRendererProps {
  text: string;
}

type StreamingSegment =
  | { type: 'text'; content: string }
  | { type: 'code'; content: string; language: string };

const FENCE_PATTERN = /```([a-z0-9_+-]*)?\n?([\s\S]*?)(?:```|$)/gi;

function parseStreamingText(text: string): StreamingSegment[] {
  const segments: StreamingSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(FENCE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      segments.push({ type: 'text', content: text.slice(cursor, index) });
    }

    segments.push({
      type: 'code',
      language: match[1] || 'text',
      content: match[2] || '',
    });
    cursor = index + match[0].length;
  }

  if (cursor < text.length) {
    segments.push({ type: 'text', content: text.slice(cursor) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', content: text }];
}

function renderText(content: string) {
  return content
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph, index) => (
      <p key={index} className="whitespace-pre-wrap">
        {paragraph}
      </p>
    ));
}

export const StreamingTextRenderer = memo(function StreamingTextRenderer({
  text,
}: StreamingTextRendererProps) {
  const segments = useMemo(() => parseStreamingText(text), [text]);

  return (
    <div className="streaming-text text-sm leading-relaxed">
      {segments.map((segment, index) =>
        segment.type === 'code' ? (
          <CodeBlock key={`${index}-code`} language={segment.language} deferHighlight>
            {segment.content}
          </CodeBlock>
        ) : (
          <div key={`${index}-text`} className="streaming-text-group">
            {renderText(segment.content)}
          </div>
        )
      )}
    </div>
  );
});
