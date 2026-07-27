import { describe, expect, it } from 'vitest';
import {
  buildCopilotActionLink,
  buildMigrationWorkflowGuideMessage,
  buildNextStepMessage,
  decodeCopilotActionHref,
  encodeCopilotActionHref,
  formatWorkflowToolMessage,
  isMigrationWorkflowGuideRequest,
  linkifyCopilotWorkflowSteps,
} from './copilotActionLinks';

describe('copilotActionLinks', () => {
  it('detects migration workflow guide requests', () => {
    expect(isMigrationWorkflowGuideRequest('Guide me through the migration workflow')).toBe(true);
    expect(isMigrationWorkflowGuideRequest('Guide me through the migration workflow.')).toBe(true);
    expect(isMigrationWorkflowGuideRequest('guide me through the migration workflow: clear session')).toBe(true);
    expect(isMigrationWorkflowGuideRequest('Migration workflow guide')).toBe(true);
    expect(isMigrationWorkflowGuideRequest('refresh design')).toBe(false);
  });

  it('round-trips workflow action hrefs', () => {
    const href = encodeCopilotActionHref({ type: 'workflow', tool: 'refreshDesign' });
    expect(decodeCopilotActionHref(href)).toEqual({ type: 'workflow', tool: 'refreshDesign' });
    expect(buildCopilotActionLink('Refresh design', { type: 'workflow', tool: 'refreshDesign' })).toContain(
      'Refresh design',
    );
  });

  it('linkifies workflow step names in prose', () => {
    const linked = linkifyCopilotWorkflowSteps('Next step: Refresh design when import completes.');
    expect(linked).toContain('copilot-action:');
    expect(linked).toContain('Refresh design');
  });

  it('builds a migration guide with clickable steps', () => {
    const guide = buildMigrationWorkflowGuideMessage();
    expect(guide).toContain('Clear session');
    expect(guide).toContain('Import ledger example');
    expect(guide).toContain('Verify collections');
    expect(guide).toContain('Architecture Review');
    expect(guide).toContain('copilot-action:');
  });

  it('builds a standalone next-step message', () => {
    expect(
      buildNextStepMessage({
        kind: 'workflow',
        label: 'Refresh design',
        tool: 'refreshDesign',
        args: {},
      }),
    ).toContain('**Next step:**');
  });

  it('appends a clickable next step to workflow summaries', () => {
    const message = formatWorkflowToolMessage('Step 1 complete: imported schema (3 tables).', {
      kind: 'workflow',
      label: 'Refresh design',
      tool: 'refreshDesign',
      args: {},
    });
    expect(message).toContain('Step 1 complete');
    expect(message).toContain('**Next step:**');
    expect(message).toContain('Refresh design');
    expect(message).toContain('copilot-action:');
  });
});
