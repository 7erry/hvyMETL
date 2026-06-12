import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDdlToModel } from '../utilities/ddlParser.js';
import { inferWorkloadProfile } from './inferProfile.js';

const TEMPLATES = join(process.cwd(), 'web', 'public', 'templates');
const ORACLE_DDL = join(process.cwd(), 'examples', 'oracle', 'oracle-all.ddl');

describe('inferWorkloadProfile', () => {
  it('detects E-commerce Catalog from catalog template', () => {
    const ddl = readFileSync(join(TEMPLATES, 'catalog.sql'), 'utf8');
    const result = inferWorkloadProfile(parseDdlToModel(ddl, 'ddl:postgresql'));
    expect(result.profileId).toBe('catalog');
    expect(result.label).toBe('E-commerce Catalog');
  });

  it('detects IoT Telemetry from iot template', () => {
    const ddl = readFileSync(join(TEMPLATES, 'iot.sql'), 'utf8');
    const result = inferWorkloadProfile(parseDdlToModel(ddl, 'ddl:postgresql'));
    expect(result.profileId).toBe('iot');
  });

  it('detects Content Management from cms template', () => {
    const ddl = readFileSync(join(TEMPLATES, 'cms.sql'), 'utf8');
    const result = inferWorkloadProfile(parseDdlToModel(ddl, 'ddl:postgresql'));
    expect(result.profileId).toBe('cms');
  });

  it('detects catalog from Oracle e-commerce DDL', () => {
    const ddl = readFileSync(ORACLE_DDL, 'utf8');
    const result = inferWorkloadProfile(parseDdlToModel(ddl, 'ddl:oracle'));
    expect(result.profileId).toBe('catalog');
    expect(result.confidence).not.toBe('low');
  });

  it('detects cms from Laravel blog template', () => {
    const ddl = readFileSync(join(TEMPLATES, 'laravel.sql'), 'utf8');
    const result = inferWorkloadProfile(parseDdlToModel(ddl, 'ddl:postgresql'));
    expect(result.profileId).toBe('cms');
  });

  it('detects mobile from Twitter-style social schema', () => {
    const ddl = readFileSync(join(TEMPLATES, 'twitter.sql'), 'utf8');
    const result = inferWorkloadProfile(parseDdlToModel(ddl, 'ddl:postgresql'));
    expect(result.profileId).toBe('mobile');
  });
});
