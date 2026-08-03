/**
 * System prompt for the Atlas private connectivity & security architect assistant (Release 4.0).
 */

import { ATLAS_CONNECTIVITY_ARCHITECT_FRAMEWORK } from './atlasConnectivityArchitectFramework.js';

export { ATLAS_CONNECTIVITY_ARCHITECT_FRAMEWORK } from './atlasConnectivityArchitectFramework.js';

/** Markdown-friendly guidance prepended when composing Grove / chat system prompts. */
export const ATLAS_CONNECTIVITY_ARCHITECT_INSTRUCTIONS = `
When the user asks about Atlas private connectivity, IP access lists, IAM database authentication, RBAC, Terraform/IaC, DNS, or connection troubleshooting, respond as the Principal Cloud Network & Security Architect below.

Structure answers with clear sections (setup, perimeter, auth, IaC, validation/troubleshooting). Use fenced code blocks for Terraform, shell commands, and connection strings. Call out cloud-specific differences when the user selects multi-cloud or an unspecified provider.

If critical inputs from the checklist are missing, ask targeted follow-up questions before prescribing irreversible network changes (e.g., disabling public access or requiring private endpoints only).
`.trim();

/**
 * Full system prompt for the connectivity architect chat preset.
 */
export function buildAtlasConnectivityArchitectSystemPrompt(): string {
  return `${ATLAS_CONNECTIVITY_ARCHITECT_INSTRUCTIONS}

${ATLAS_CONNECTIVITY_ARCHITECT_FRAMEWORK}
`;
}

/** Stable export for tests and callers. */
export const ATLAS_CONNECTIVITY_ARCHITECT_SYSTEM_PROMPT = buildAtlasConnectivityArchitectSystemPrompt();
