import type { CopilotNextStep, MongoInspectToolName, WorkflowToolName } from './types';

/** Prefix for markdown links that trigger copilot actions when clicked. */
export const COPILOT_ACTION_HREF_PREFIX = 'copilot-action:';

export const VERIFY_IMPORTED_COLLECTIONS_PROMPT = 'Verify imported collections';

export const POST_IMPORT_ARCHITECTURE_REVIEW_PROMPT = [
  'Produce a collective **Architecture Review** of all collections I just imported into Atlas.',
  'Review each collection against the migration plan, embed decisions, indexes, guardrails, and Manager dataset scale.',
  'Use the required architecture review format with collapsible sections.',
].join(' ');

export type CopilotPromptAction = {
  type: 'prompt';
  prompt: string;
};

export type CopilotWorkflowAction = {
  type: 'workflow';
  tool: WorkflowToolName;
  args?: Record<string, unknown>;
};

export type CopilotInspectAction = {
  type: 'inspect';
  tool: MongoInspectToolName;
  args: Record<string, unknown>;
};

export type CopilotAction = CopilotPromptAction | CopilotWorkflowAction | CopilotInspectAction;

export const MIGRATION_WORKFLOW_GUIDE_PROMPT = 'Guide me through the migration workflow';

/** One step in the guided migration workflow (label, description, runnable action). */
export type MigrationWorkflowStep = {
  label: string;
  description: string;
  action: CopilotAction;
};

/** Ordered migration workflow steps shown in the copilot guide. */
export const MIGRATION_WORKFLOW_STEPS: MigrationWorkflowStep[] = [
  {
    label: 'Clear session',
    description: 'reset the canvas and open schema import',
    action: { type: 'workflow', tool: 'clearSession' },
  },
  {
    label: 'Import ledger example',
    description: 'or paste SQL DDL in the import dialog',
    action: { type: 'workflow', tool: 'importBuiltinExample', args: { exampleId: 'ledger' } },
  },
  {
    label: 'Refresh design',
    description: 'generate the MongoDB target schema (ML/RAG)',
    action: { type: 'workflow', tool: 'refreshDesign' },
  },
  {
    label: 'Run pipeline',
    description: 'open the Atlas import panel for CSV/SQLite',
    action: { type: 'workflow', tool: 'runPipeline' },
  },
  {
    label: 'Verify collections',
    description: 'list collections in your logical database',
    action: { type: 'prompt', prompt: VERIFY_IMPORTED_COLLECTIONS_PROMPT },
  },
  {
    label: 'Architecture Review',
    description: 'collective review of imported collections',
    action: { type: 'prompt', prompt: POST_IMPORT_ARCHITECTURE_REVIEW_PROMPT },
  },
];

/** True when the user asks for the guided migration workflow. */
export function isMigrationWorkflowGuideRequest(input: string): boolean {
  const trimmed = input.trim().replace(/[.!?]+$/, '').trim();
  if (!trimmed) return false;
  return (
    /^guide me through the migration workflow(?:[:\s].*)?$/i.test(trimmed) ||
    /^migration workflow guide$/i.test(trimmed)
  );
}

/** Serializes a copilot action into a markdown link href. */
export function encodeCopilotActionHref(action: CopilotAction): string {
  return `${COPILOT_ACTION_HREF_PREFIX}${encodeURIComponent(JSON.stringify(action))}`;
}

/** Parses a copilot-action href back into a runnable action. */
export function decodeCopilotActionHref(href: string): CopilotAction | null {
  if (!href.startsWith(COPILOT_ACTION_HREF_PREFIX)) return null;
  const payload = href.slice(COPILOT_ACTION_HREF_PREFIX.length);
  try {
    const parsed = JSON.parse(decodeURIComponent(payload)) as CopilotAction;
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Converts a stored next-step action into a copilot-action link target. */
export function copilotActionFromNextStep(step: CopilotNextStep): CopilotAction {
  if (step.kind === 'workflow') {
    return { type: 'workflow', tool: step.tool, args: step.args };
  }
  if (step.kind === 'prompt') {
    return { type: 'prompt', prompt: step.prompt };
  }
  return { type: 'inspect', tool: step.tool, args: step.args };
}

/** Builds a markdown link that runs a copilot action when clicked. */
export function buildCopilotActionLink(label: string, action: CopilotAction): string {
  return `[${label}](${encodeCopilotActionHref(action)})`;
}

/** Builds a markdown link for a workflow tool. */
export function buildWorkflowActionLink(label: string, tool: WorkflowToolName, args: Record<string, unknown> = {}): string {
  return buildCopilotActionLink(label, { type: 'workflow', tool, args });
}

/** Builds a markdown link that sends a chat prompt. */
export function buildPromptActionLink(label: string, prompt: string): string {
  return buildCopilotActionLink(label, { type: 'prompt', prompt });
}

/** Builds a markdown link for importing a built-in example. */
export function buildImportExampleActionLink(label: string, exampleId: string): string {
  return buildCopilotActionLink(label, {
    type: 'workflow',
    tool: 'importBuiltinExample',
    args: { exampleId },
  });
}

const WORKFLOW_STEP_LINKS: Array<{ pattern: RegExp; action: CopilotAction; label: string }> = [
  {
    pattern: /\bGuide me through the migration workflow\b/gi,
    action: { type: 'prompt', prompt: MIGRATION_WORKFLOW_GUIDE_PROMPT },
    label: 'Guide me through the migration workflow',
  },
  {
    pattern: /\bRefresh design\b/g,
    action: { type: 'workflow', tool: 'refreshDesign' },
    label: 'Refresh design',
  },
  {
    pattern: /\bRun pipeline\b/g,
    action: { type: 'workflow', tool: 'runPipeline' },
    label: 'Run pipeline',
  },
  {
    pattern: /\bClear session\b/g,
    action: { type: 'workflow', tool: 'clearSession' },
    label: 'Clear session',
  },
  {
    pattern: /\bArchitecture Review\b/g,
    action: { type: 'prompt', prompt: POST_IMPORT_ARCHITECTURE_REVIEW_PROMPT },
    label: 'Architecture Review',
  },
  {
    pattern: /\bVerify collections\b(?!\s+in\s+\S)/gi,
    action: { type: 'prompt', prompt: VERIFY_IMPORTED_COLLECTIONS_PROMPT },
    label: 'Verify collections',
  },
];

/** Wraps known workflow step names in copilot-action links when they are not already linked. */
export function linkifyCopilotWorkflowSteps(markdown: string): string {
  let output = markdown;
  for (const entry of WORKFLOW_STEP_LINKS) {
    output = output.replace(entry.pattern, (match, offset, source) => {
      const before = source.slice(Math.max(0, offset - 2), offset);
      const after = source.slice(offset + match.length, offset + match.length + 1);
      if (before.endsWith('[') || after.startsWith(']')) return match;
      return buildCopilotActionLink(entry.label, entry.action);
    });
  }
  return output;
}

/** Builds a markdown link that starts the migration workflow guide. */
export function buildMigrationWorkflowGuideLink(): string {
  return buildPromptActionLink('Guide me through the migration workflow', MIGRATION_WORKFLOW_GUIDE_PROMPT);
}

/** Markdown guide shown when the user starts the migration workflow. */
export function buildMigrationWorkflowGuideMessage(): string {
  const stepLines = MIGRATION_WORKFLOW_STEPS.map(
    (step, index) => `${index + 1}. ${buildCopilotActionLink(step.label, step.action)} — ${step.description}`,
  );
  const firstStep = MIGRATION_WORKFLOW_STEPS[0];
  return [
    '## Migration workflow',
    '',
    'Follow these steps in order (click to run each step):',
    '',
    ...stepLines,
    '',
    `Start with ${buildCopilotActionLink(firstStep.label, firstStep.action)}.`,
  ].join('\n');
}

/** Markdown for a clickable next-step line under a tool result (summary lives on the tool card). */
export function buildNextStepMessage(nextStep?: CopilotNextStep): string {
  if (!nextStep) return '';
  return `**Next step:** ${buildCopilotActionLink(nextStep.label, copilotActionFromNextStep(nextStep))}`;
}

/** Appends a clickable next-step link to a workflow tool summary. */
export function formatWorkflowToolMessage(summary: string, nextStep?: CopilotNextStep): string {
  const linkedSummary = linkifyCopilotWorkflowSteps(summary);
  const nextStepLine = buildNextStepMessage(nextStep);
  if (!nextStepLine) return linkedSummary;
  if (!linkedSummary.trim()) return nextStepLine;
  return `${linkedSummary}\n\n${nextStepLine}`;
}
