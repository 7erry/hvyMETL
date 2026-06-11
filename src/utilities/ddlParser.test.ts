import { describe, expect, it } from 'vitest';
import { parseDdlToModel } from './ddlParser.js';

const SAMPLE = `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255) NOT NULL
);
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title VARCHAR(200) NOT NULL
);
`;

describe('parseDdlToModel', () => {
  it('parses multiple CREATE TABLE statements', () => {
    const model = parseDdlToModel(SAMPLE);
    expect(model.tables).toHaveLength(2);
    expect(model.tables[1].foreignKeys[0]?.referencesTable).toBe('users');
  });
});
