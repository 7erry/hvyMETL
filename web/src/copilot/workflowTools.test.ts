import { describe, expect, it } from 'vitest';
import {
  attachPostVerifyArchitectureReviewNextStep,
  attachWorkflowNextStep,
  buildPipelineVerifyNextStep,
  buildPostImportArchitectureReviewNextStep,
  parseDirectWorkflowCommand,
  parseWorkflowToolCall,
  resolveWorkflowNextStep,
} from './workflowTools';

describe('workflowTools', () => {
  it('parses workflow tool calls from OpenAI payloads', () => {
    expect(parseWorkflowToolCall('clearSession', {})).toEqual({
      kind: 'workflow',
      tool: 'clearSession',
      args: {},
    });
    expect(parseWorkflowToolCall('importSchemaDdl', { ddl: 'CREATE TABLE t (id INT);' })).toEqual({
      kind: 'workflow',
      tool: 'importSchemaDdl',
      args: { ddl: 'CREATE TABLE t (id INT);', dialect: undefined },
    });
    expect(parseWorkflowToolCall('refreshDesign', {})).toEqual({
      kind: 'workflow',
      tool: 'refreshDesign',
      args: {},
    });
  });

  it('routes slash commands and natural phrases directly', () => {
    expect(parseDirectWorkflowCommand('/clear-session')).toEqual({
      kind: 'workflow',
      tool: 'clearSession',
      args: {},
    });
    expect(parseDirectWorkflowCommand('refresh design')).toEqual({
      kind: 'workflow',
      tool: 'refreshDesign',
      args: {},
    });
    expect(parseDirectWorkflowCommand('run pipeline')).toEqual({
      kind: 'workflow',
      tool: 'runPipeline',
      args: {},
    });
    expect(parseDirectWorkflowCommand('import oracle example')).toEqual({
      kind: 'workflow',
      tool: 'importBuiltinExample',
      args: { exampleId: 'oracle' },
    });
  });

  it('suggests clickable next steps after import and design workflow tools', () => {
    expect(resolveWorkflowNextStep('clearSession')).toEqual({
      kind: 'workflow',
      label: 'Refresh design',
      tool: 'refreshDesign',
      args: {},
    });
    expect(resolveWorkflowNextStep('importBuiltinExample')).toEqual({
      kind: 'workflow',
      label: 'Refresh design',
      tool: 'refreshDesign',
      args: {},
    });
    expect(resolveWorkflowNextStep('refreshDesign')).toEqual({
      kind: 'workflow',
      label: 'Run pipeline',
      tool: 'runPipeline',
      args: {},
    });
    expect(resolveWorkflowNextStep('runPipeline')).toBeUndefined();

    const enriched = attachWorkflowNextStep({
      tool: 'importSchemaDdl',
      summary: 'Imported 5 tables.',
      delta: [],
      ok: true,
    });
    expect(enriched.nextStep?.label).toBe('Refresh design');
  });

  it('builds a verify-collections next step after pipeline import', () => {
    expect(buildPipelineVerifyNextStep('finops')).toEqual({
      kind: 'mongoInspect',
      label: 'Verify collections in finops',
      tool: 'listMongoCollections',
      args: { database: 'finops' },
    });
  });

  it('builds an architecture review next step after verifying imported collections', () => {
    expect(buildPostImportArchitectureReviewNextStep('finops')).toEqual({
      kind: 'prompt',
      label: 'Architecture Review',
      prompt: expect.stringContaining('finops'),
    });

    const enriched = attachPostVerifyArchitectureReviewNextStep(
      {
        tool: 'listMongoCollections',
        summary: 'Listed 5 collection(s) in finops.',
        delta: [],
        ok: true,
      },
      { database: 'finops' },
    );
    expect(enriched.nextStep?.label).toBe('Architecture Review');
  });
});
