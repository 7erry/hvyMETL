import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { PrismCodeBlock } from '../PrismCodeBlock';
import { formatCopilotResponse } from '../../copilot/formatCopilotResponse';
import { isArchitectureReviewContent } from '../../copilot/architectureReviewExport';
import { ArchitectureReviewSaveToDrive } from './ArchitectureReviewSaveToDrive';
import { useCopilot } from '../../copilot/CopilotContext';
import { decodeCopilotActionHref } from '../../copilot/copilotActionLinks';
import { copilotMarkdownSanitizeSchema } from '../../copilot/copilotMarkdownSanitize';

type CopilotMessageBodyProps = {
  content: string;
  markdown?: boolean;
};

/** Renders copilot chat content as formatted markdown with collapsible sections. */
export function CopilotMessageBody({ content, markdown = false }: CopilotMessageBodyProps) {
  const copilot = useCopilot();
  const formatted = useMemo(
    () => (markdown ? formatCopilotResponse(content) : content),
    [content, markdown],
  );
  const showSaveToDrive = markdown && isArchitectureReviewContent(content);

  if (!markdown) {
    return <div className="copilot-message__body">{content}</div>;
  }

  return (
    <div className="copilot-message__body copilot-message__body--markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, copilotMarkdownSanitizeSchema]]}
        components={{
          a: ({ href, children }) => {
            const action = href ? decodeCopilotActionHref(href) : null;
            if (action) {
              return (
                <button
                  type="button"
                  className="copilot-action-link"
                  disabled={copilot.status !== 'idle'}
                  onClick={() => copilot.runCopilotAction(action)}
                >
                  {children}
                </button>
              );
            }
            if (!href) {
              return <span>{children}</span>;
            }
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
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
                <PrismCodeBlock
                  code={text}
                  language={language}
                  style={{
                    margin: '0.5rem 0',
                    borderRadius: '6px',
                    fontSize: '0.65rem',
                    border: '1px solid var(--copilot-border)',
                  }}
                />
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
      {showSaveToDrive ? <ArchitectureReviewSaveToDrive content={content} /> : null}
    </div>
  );
}
