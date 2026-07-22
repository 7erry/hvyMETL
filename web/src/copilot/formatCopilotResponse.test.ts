import { describe, expect, it } from 'vitest';
import { formatCopilotResponse, wrapCollapsibleSections } from './formatCopilotResponse';

describe('formatCopilotResponse', () => {
  it('wraps numbered sections 2+ in details elements', () => {
    const input = `# Trains — Architecture Review

> **Verdict:** Detach telemetry.

## 1. Executive summary

Short summary here.

## 2. Entity & workload analysis

Long analysis here.

## 3. Production MongoDB design patterns

Patterns here.`;

    const output = wrapCollapsibleSections(input);
    expect(output).toContain('## 1. Executive summary');
    expect(output).toContain('<details class="copilot-details">');
    expect(output).toContain('<summary>2. Entity & workload analysis</summary>');
    expect(output).toContain('<summary>3. Production MongoDB design patterns</summary>');
    expect(output).not.toContain('## 2. Entity');
  });

  it('does not double-wrap when details are already present', () => {
    const input = `<details><summary>2. Analysis</summary>\n\nBody\n</details>`;
    expect(wrapCollapsibleSections(input)).toBe(input);
  });

  it('normalizes spacing before headings', () => {
    const output = formatCopilotResponse('Line one\n## Two\nContent');
    expect(output).toContain('Line one\n\n## Two');
  });
});
