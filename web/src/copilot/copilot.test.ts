import { describe, expect, it } from 'vitest';
import { parseDdlToModel } from '../../../src/utilities/ddlParser.js';
import { analyzeMigrationRisks, guardrailsByTable } from './guardrails.js';
import { executeAgentTool, parseCopilotCommand } from './agentTools.js';

const TELEMETRY_DDL = `
CREATE TABLE trips (
  id INTEGER PRIMARY KEY,
  name VARCHAR(100) NOT NULL
);
CREATE TABLE train_telemetry (
  id INTEGER PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trips(id),
  recorded_at TIMESTAMP NOT NULL,
  speed REAL NOT NULL
);
`;

describe('analyzeMigrationRisks', () => {
  it('flags unbounded telemetry children', () => {
    const model = parseDdlToModel(TELEMETRY_DDL, 'test');
    const issues = analyzeMigrationRisks(model);
    expect(issues.some((issue) => issue.kind === 'unbounded-array' && issue.tableName === 'train_telemetry')).toBe(
      true,
    );
  });

  it('groups issues by table for canvas badges', () => {
    const model = parseDdlToModel(TELEMETRY_DDL, 'test');
    const byTable = guardrailsByTable(analyzeMigrationRisks(model));
    expect(byTable.has('train_telemetry')).toBe(true);
  });
});

describe('agentTools', () => {
  it('parses /fold slash command', () => {
    const parsed = parseCopilotCommand('/fold train_telemetry -> trips array');
    expect(parsed).toMatchObject({
      tool: 'foldTable',
      args: { sourceTable: 'train_telemetry', targetTable: 'trips', embedType: 'array' },
    });
  });

  it('executes foldTable and returns force embed mutation', () => {
    const model = parseDdlToModel(TELEMETRY_DDL, 'test');
    const { result, mutation } = executeAgentTool(
      { tool: 'foldTable', args: { sourceTable: 'train_telemetry', targetTable: 'trips', embedType: 'array' } },
      { model, plan: null, cardinalityOverrides: {}, forceEmbedOverrides: {}, embedFieldOverrides: {} },
    );
    expect(result.ok).toBe(true);
    expect(Object.keys(mutation.forceEmbedOverrides ?? {}).length).toBe(1);
  });
});
