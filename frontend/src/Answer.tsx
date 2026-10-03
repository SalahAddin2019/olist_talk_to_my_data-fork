import { memo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import AnswerTable from './components/AnswerTable';

// Raw HTML stays disabled (react-markdown default); answers are agent output.
export default memo(function Answer({ text }: { text: string }) {
  return (
    <div className="prose-answer">
      <Markdown remarkPlugins={[remarkGfm]} components={{ table: AnswerTable }}>
        {text}
      </Markdown>
    </div>
  );
});
