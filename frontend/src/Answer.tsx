import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BarChart3 } from 'lucide-react';

export default function Answer({ text }: { text: string }) {
  return (
    <div className="result">
      <div className="answer-label">
        <span className="mini-logo">
          <BarChart3 aria-hidden="true" size={15} />
        </span>{' '}
        Olist assistant
      </div>
      <div className="answer-text">
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={{
            table: (props) => (
              <div className="table-scroll" tabIndex={0} role="region" aria-label="Answer table">
                <table {...props} />
              </div>
            ),
          }}
        >
          {text}
        </Markdown>
      </div>
    </div>
  );
}
