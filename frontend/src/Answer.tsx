import { memo, type ComponentProps } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

function AnswerTable({ node: _node, ...props }: ComponentProps<'table'> & { node?: unknown }) {
  return (
    <div
      className="my-4 max-h-96 overflow-auto rounded-xl border border-line"
      tabIndex={0}
      role="region"
      aria-label="Answer table"
    >
      <table {...props} />
    </div>
  );
}

const components: Components = {
  table: AnswerTable,
};

// Raw HTML stays disabled (react-markdown default); answers are agent output.
export default memo(function Answer({ text }: { text: string }) {
  return (
    <div className="prose-answer">
      <Markdown remarkPlugins={[remarkGfm]} components={components} disallowedElements={['img']}>
        {text}
      </Markdown>
    </div>
  );
});
