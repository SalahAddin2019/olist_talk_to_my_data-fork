import { memo } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import AnswerTable from './components/AnswerTable';

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
