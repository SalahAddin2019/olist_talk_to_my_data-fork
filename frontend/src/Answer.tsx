import { memo, useState } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import AnswerTable from './components/AnswerTable';

const components: Components = {
  table: AnswerTable,
  img: ({ src, alt }) => <ChartImage key={String(src)} src={String(src ?? '')} alt={alt} />,
};

// Raw HTML stays disabled (react-markdown default); answers are agent output.
export default memo(function Answer({ text }: { text: string }) {
  return (
    <div className="prose-answer">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </Markdown>
    </div>
  );
});

function isArtifact(src?: string): boolean {
  return /^\/api\/conversations\/conv_[A-Za-z0-9_-]+\/files\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+(?:\?download=true)?$/.test(
    src ?? '',
  );
}

function ChartImage({ src, alt }: { src: string; alt?: string }) {
  const [failed, setFailed] = useState(false);
  if (!isArtifact(src)) return <span>{alt || 'Chart unavailable'}</span>;
  if (failed) {
    return (
      <span
        className="my-3 block rounded-lg border border-line bg-surface-2 p-3 text-sm text-ink-2"
        role="status"
      >
        This chart is unavailable or has expired. Ask for a fresh chart.
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt || 'Generated chart'}
      loading="lazy"
      onError={() => setFailed(true)}
      className="my-4 block h-auto max-w-full rounded-xl border border-line bg-white"
    />
  );
}
