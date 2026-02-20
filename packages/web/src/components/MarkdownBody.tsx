import { Streamdown } from 'streamdown';
import rehypeHighlight from 'rehype-highlight';
import 'streamdown/styles.css';
import 'highlight.js/styles/github-dark.css';

interface MarkdownBodyProps {
  content: string;
  className?: string;
}

// Collapse 3+ consecutive blank lines into one blank line
function preprocess(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n');
}

export function MarkdownBody({ content, className }: MarkdownBodyProps) {
  const processed = preprocess(content);
  return (
    <div className={`markdown-body${className ? ` ${className}` : ''}`}>
      <Streamdown rehypePlugins={[rehypeHighlight]}>
        {processed}
      </Streamdown>
    </div>
  );
}
