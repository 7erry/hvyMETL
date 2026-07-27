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

const TWO_CHILD_DDL = `
CREATE TABLE parents (
  id INTEGER PRIMARY KEY,
  name VARCHAR(100) NOT NULL
);
CREATE TABLE child_a (
  id INTEGER PRIMARY KEY,
  parent_id INTEGER NOT NULL REFERENCES parents(id),
  label VARCHAR(40) NOT NULL
);
CREATE TABLE child_b (
  id INTEGER PRIMARY KEY,
  parent_id INTEGER NOT NULL REFERENCES parents(id),
  label VARCHAR(40) NOT NULL
);
`;

describe('agentTools', () => {
  it('parses /fold slash command', () => {
    const parsed = parseCopilotCommand('/fold train_telemetry -> trips array');
    expect(parsed).toMatchObject({
      tool: 'foldTable',
      args: { sourceTable: 'train_telemetry', targetTable: 'trips', embedType: 'array' },
    });
  });

  it('parses fold all tables command', () => {
    expect(parseCopilotCommand('fold all tables')).toMatchObject({ tool: 'foldAllTables', args: {} });
    expect(parseCopilotCommand('/fold-all')).toMatchObject({ tool: 'foldAllTables', args: {} });
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

  it('foldAllTables matches Embed Overrides Force All', () => {
    const model = parseDdlToModel(TWO_CHILD_DDL, 'test');
    const { result, mutation } = executeAgentTool(
      { tool: 'foldAllTables', args: {} },
      { model, plan: null, cardinalityOverrides: {}, forceEmbedOverrides: {}, embedFieldOverrides: {} },
    );
    expect(result.ok).toBe(true);
    expect(Object.keys(mutation.forceEmbedOverrides ?? {})).toHaveLength(model.relationships.length);
    for (const relationship of model.relationships) {
      expect(mutation.forceEmbedOverrides?.[`${relationship.parentTable}::${relationship.childTable}::${relationship.fkColumn}`]).toBe(
        true,
      );
    }
  });

  it('accumulates force embed overrides across sequential foldTable calls', () => {
    const model = parseDdlToModel(TWO_CHILD_DDL, 'test');
    let ctx = {
      model,
      plan: null,
      cardinalityOverrides: {},
      forceEmbedOverrides: {},
      embedFieldOverrides: {},
    };
    const first = executeAgentTool(
      { tool: 'foldTable', args: { sourceTable: 'child_a', targetTable: 'parents', embedType: 'array' } },
      ctx,
    );
    ctx = {
      ...ctx,
      forceEmbedOverrides: first.mutation.forceEmbedOverrides ?? {},
      cardinalityOverrides: first.mutation.cardinalityOverrides ?? {},
    };
    const second = executeAgentTool(
      { tool: 'foldTable', args: { sourceTable: 'child_b', targetTable: 'parents', embedType: 'array' } },
      ctx,
    );
    expect(Object.keys(second.mutation.forceEmbedOverrides ?? {})).toHaveLength(2);
  });
});
