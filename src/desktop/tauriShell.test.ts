import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('desktop shell', () => {
  it('loads the studio server the shell starts itself', () => {
    const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')) as {
      build: { devUrl: string; frontendDist: string };
      app: { windows: { url: string; label: string }[] };
    };
    const rust = readFileSync('src-tauri/src/lib.rs', 'utf8');
    expect(conf.build.devUrl).toBe('http://127.0.0.1:3847');
    expect(conf.build.frontendDist).toBe('../web/dist');
    expect(conf.app.windows[0]).toMatchObject({ label: 'main', url: 'http://127.0.0.1:3847' });
    expect(rust).toContain('dist/server/index.js');
    expect(rust).toContain('studio_port_open');
  });
});