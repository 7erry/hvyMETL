import { describe, expect, it } from 'vitest';
import { parseDirectWorkflowCommand, parseWorkflowToolCall } from './workflowTools';

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
});
