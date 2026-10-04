import type { ComponentProps } from 'react';

export default function AnswerTable({
  node: _node,
  ...props
}: ComponentProps<'table'> & { node?: unknown }) {
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
