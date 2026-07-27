import { defaultSchema } from 'rehype-sanitize';

/** rehype-sanitize schema that preserves copilot-action: link hrefs for clickable workflow steps. */
export const copilotMarkdownSanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'details', 'summary'],
  attributes: {
    ...defaultSchema.attributes,
    details: ['className', 'class', 'open'],
    summary: ['className', 'class'],
    code: [...(defaultSchema.attributes?.code ?? []), 'className', 'class'],
    a: [...(defaultSchema.attributes?.a ?? []), 'href', 'className', 'class'],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? ['http', 'https', 'mailto', 'tel']), 'copilot-action'],
  },
};
