import { useState } from 'react';

type CopyButtonProps = {
  text: string;
  label?: string;
  className?: string;
  title?: string;
};

/** Copy text to the clipboard with brief confirmation feedback. */
export function CopyButton({ text, label = 'Copy', className = '', title }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className={`copy-button tertiary${className ? ` ${className}` : ''}`}
      title={title ?? `Copy ${label}`}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        });
      }}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}
