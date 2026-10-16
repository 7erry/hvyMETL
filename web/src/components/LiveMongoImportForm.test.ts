import { describe, expect, it } from 'vitest';
import { liveConnectionHint, liveImportFormNotice } from './LiveMongoImportForm';

describe('liveImportFormNotice', () => {
  it('repeats live-import status and ignores unrelated studio messages', () => {
    expect(liveImportFormNotice('Reading the live database…')).toBe('Reading the live database…');
    expect(liveImportFormNotice('Import failed: Could not connect to MongoDB.')).toMatch(/Could not connect/);
    expect(liveImportFormNotice('On the computer with the database, run: npx hvymetl agent')).toMatch(/npx hvymetl agent/);
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
