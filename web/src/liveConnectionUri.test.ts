import { describe, expect, it } from 'vitest';
import {
  buildLiveConnectionUri,
  liveConnectionDisplayHost,
  parseLiveConnectionUri,
} from './liveConnectionUri';

describe('buildLiveConnectionUri', () => {
  it('builds postgres URIs with auth, schema, and sslmode', () => {
    expect(
      buildLiveConnectionUri('postgresql', {
        host: '127.0.0.1',
        port: '5432',
        database: 'dvdrental',
        user: 'hippo',
        password: 'secret',
        schema: 'public',
        sslMode: 'require',
      }),
    ).toBe('postgresql://hippo:secret@127.0.0.1:5432/dvdrental?schema=public&sslmode=require');
  });

  it('omits auth when user is blank', () => {
    expect(
      buildLiveConnectionUri('mysql', {
        host: 'db.local',
        port: '3306',
        database: 'shop',
        user: '',
        password: '',
        schema: '',
        sslMode: '',
      }),
    ).toBe('mysql://db.local:3306/shop');
  });
});

describe('parseLiveConnectionUri', () => {
  it('round-trips postgres fields', () => {
    const uri = 'postgresql://hippo:secret@127.0.0.1:5432/dvdrental?schema=public&sslmode=require';
    const fields = parseLiveConnectionUri('postgresql', uri);
    expect(fields).toEqual({
      host: '127.0.0.1',
      port: '5432',
      database: 'dvdrental',
      user: 'hippo',
      password: 'secret',
      schema: 'public',
      sslMode: 'require',
    });
    expect(buildLiveConnectionUri('postgresql', fields)).toBe(uri);
  });
});

describe('liveConnectionDisplayHost', () => {
  it('extracts host for labels', () => {
    expect(liveConnectionDisplayHost('postgresql://hippo@127.0.0.1:5432/shop', 'postgresql')).toBe('127.0.0.1');
  });
});
