import { describe, expect, it } from 'vitest';
import { liveAgentRunCommand, liveConnectionHint, liveImportFormNotice } from './LiveMongoImportForm';

describe('liveImportFormNotice', () => {
  it('repeats live-import status and ignores unrelated studio messages', () => {
    expect(liveImportFormNotice('Reading the live database…')).toBe('Reading the live database…');
    expect(liveImportFormNotice('Import failed: Could not connect to MongoDB.')).toMatch(/Could not connect/);
    expect(liveImportFormNotice('On the computer with the database, run: ./hvymetl-agent-macos-aarch64')).toMatch(/hvymetl-agent/);
    expect(liveImportFormNotice('Loaded example "Catalog" (4 tables).')).toBe('');
  });
});

describe('liveConnectionHint', () => {
  it('matches the connection string shape to the selected engine', () => {
    expect(liveConnectionHint('mongodb').placeholder).toMatch(/^mongodb:\/\//);
    expect(liveConnectionHint('postgresql').placeholder).toMatch(/^postgresql:\/\//);
    expect(liveConnectionHint('mysql').placeholder).toMatch(/^mysql:\/\//);
    expect(liveConnectionHint('postgresql').hint).toMatch(/schema=/);
  });
});

describe('liveAgentRunCommand', () => {
  it('runs the downloaded binary and keeps the connection string quoted', () => {
    const command = liveAgentRunCommand('abc', "mongodb://localhost:27017", 'sample_airbnb');
    expect(command).toContain('./hvymetl-agent-macos-aarch64 --token abc');
    expect(command).toContain("--uri 'mongodb://localhost:27017'");
    expect(command).toContain("--database 'sample_airbnb'");
    expect(command).not.toContain('npx');
  });
});
