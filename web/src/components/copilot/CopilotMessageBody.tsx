import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { formatCopilotResponse } from '../../copilot/formatCopilotResponse';

type CopilotMessageBodyProps = {
  content: string;
  markdown?: boolean;
};

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'details', 'summary'],
  attributes: {
    ...defaultSchema.attributes,
    details: ['className', 'class', 'open'],
    summary: ['className', 'class'],
    code: [...(defaultSchema.attributes?.code ?? []), 'className', 'class'],
  },
};

/** Renders copilot chat content as formatted markdown with collapsible sections. */
export function CopilotMessageBody({ content, markdown = false }: CopilotMessageBodyProps) {
  const formatted = useMemo(
    () => (markdown ? formatCopilotResponse(content) : content),
    [content, markdown],
  );

  if (!markdown) {
    return <div className="copilot-message__body">{content}</div>;
  }

  return (
    <div className="copilot-message__body copilot-message__body--markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        components={{
          h1: ({ children }) => <h1 className="copilot-md-h1">{children}</h1>,
          h2: ({ children }) => <h2 className="copilot-md-h2">{children}</h2>,
          h3: ({ children }) => <h3 className="copilot-md-h3">{children}</h3>,
          p: ({ children }) => <p className="copilot-md-p">{children}</p>,
          table: ({ children }) => (
            <div className="copilot-md-table-wrap">
              <table className="copilot-md-table">{children}</table>
            </div>
          ),
          code: ({ className, children }) => {
            const text = String(children).replace(/\n$/, '');
            const language = /language-(\w+)/.exec(className ?? '')?.[1];
            if (language) {
              return (
                <SyntaxHighlighter
                  style={oneDark}
                  language={language}
                  PreTag="div"
                  customStyle={{
                    margin: '0.5rem 0',
                    borderRadius: '6px',
                    fontSize: '0.65rem',
                    border: '1px solid var(--copilot-border)',
                  }}
                >
                  {text}
                </SyntaxHighlighter>
              );
            }
            return <code className="copilot-md-inline-code">{children}</code>;
          },
          blockquote: ({ children }) => <blockquote className="copilot-md-callout">{children}</blockquote>,
          details: ({ children }) => <details className="copilot-details">{children}</details>,
          summary: ({ children }) => <summary className="copilot-details__summary">{children}</summary>,
        }}
      >
        {formatted}
      </ReactMarkdown>
    </div>
  );
}
