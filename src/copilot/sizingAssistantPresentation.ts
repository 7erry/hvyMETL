/**
 * Format sizing tool output for user-facing assistant text (no cost breakdown).
 */

import type { SizingToolResult } from './sizingAssistantTools.js';

const COST_FIELD_PATTERN = /finalHourlyCost|hourlyCost|cost_base|cost_secondary|pricing/i;

/** Remove pricing-related keys from nested objects before serializing to the model/user. */
export function stripPricingFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripPricingFields(item));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (COST_FIELD_PATTERN.test(key)) continue;
      out[key] = stripPricingFields(nested);
    }
    return out;
  }
  return value;
}

/** JSON tool result safe for assistant presentation per Phase 1 prompt rules. */
export function formatSizingToolResultForAssistant(result: SizingToolResult): string {
  const payload = {
    ok: result.ok,
    tool: result.tool,
    summary: result.summary,
    data: result.data ? stripPricingFields(result.data) : undefined,
  };
  return JSON.stringify(payload, null, 2);
}

/** Scrub assistant-visible text that accidentally mentions hourly cost. */
export function sanitizeAssistantContent(content: string): string {
  return content
    .replace(/\bfinalHourlyCost\b[^\n]*/gi, '')
    .replace(/\bhourly cost[^.\n]*\./gi, '')
    .replace(/\btotal pricing[^.\n]*\./gi, '')
    .trim();
}
