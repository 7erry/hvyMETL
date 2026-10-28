import { describe, expect, it } from 'vitest';
import { expandMongoshShellHelpers } from './mongoShellHelpers.js';

describe('expandMongoshShellHelpers', () => {
  it('expands show collections with database context', () => {
    const out = expandMongoshShellHelpers('show collections');
    expect(out).toContain('db.getCollectionNames()');
    expect(out).toContain('EJSON.stringify');
  });

  it('expands show dbs and use', () => {
    const out = expandMongoshShellHelpers('use inventory\nshow dbs');
    expect(out).toContain("db = db.getSiblingDB('inventory');");
    expect(out).toContain('listDatabases: 1');
  });

  it('prints find() cursors via EJSON toArray', () => {
    const out = expandMongoshShellHelpers('use retail_banking\ndb.accounts.find()');
    expect(out).toContain("db = db.getSiblingDB('retail_banking');");
    expect(out).toContain('EJSON.stringify(db.accounts.find().limit(50).toArray()');
  });

  it('applies custom findLimit to bare find()', () => {
    const out = expandMongoshShellHelpers('db.accounts.find()', 25);
    expect(out).toContain('EJSON.stringify(db.accounts.find().limit(25).toArray()');
  });

  it('prints findOne and runCommand as EJSON', () => {
    expect(expandMongoshShellHelpers('db.accounts.findOne()')).toContain(
      'EJSON.stringify(db.accounts.findOne()',
    );
    expect(expandMongoshShellHelpers('db.runCommand({ ping: 1 })')).toContain(
      'EJSON.stringify(db.runCommand({ ping: 1 })',
    );
  });

  it('leaves explicit print alone', () => {
    expect(expandMongoshShellHelpers('printjson(db.accounts.find().toArray())')).toBe(
      'printjson(db.accounts.find().toArray())',
    );
  });

  it('preserves indentation and comments', () => {
    const src = '// keep\n  show tables';
    const out = expandMongoshShellHelpers(src);
    expect(out.startsWith('// keep\n  ')).toBe(true);
    expect(out).toContain('db.getCollectionNames()');
  });
});
