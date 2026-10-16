import { describe, expect, it } from 'vitest';
import { detectLiveAgentPlatform, liveAgentDownloadUrl, liveAgentRunCommand, liveConnectionHint, liveImportFormNotice } from './LiveMongoImportForm';

describe('liveImportFormNotice', () => {
  it('repeats live-import status and ignores unrelated studio messages', () => {
    expect(liveImportFormNotice('Reading the live database…')).toBe('Reading the live database…');
    expect(liveImportFormNotice('Import failed: Could not connect to MongoDB.')).toMatch(/Could not connect/);
    expect(liveImportFormNotice('Command copied. On the computer with the database, run: ./hvymetl-agent-macos-aarch64')).toMatch(/hvymetl-agent/);
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
  it('builds a paste-ready command for each download', () => {
    const mac = liveAgentRunCommand('macos-aarch64', 'abc', 'mongodb://localhost:27017', 'sample_airbnb');
    expect(mac).toContain('chmod +x hvymetl-agent-macos-aarch64 && ./hvymetl-agent-macos-aarch64 --token abc');
    expect(mac).toContain("--uri 'mongodb://localhost:27017'");
    expect(mac).toContain("--database 'sample_airbnb'");
    expect(liveAgentRunCommand('macos-x64', 'abc', 'mongodb://localhost:27017', '')).toContain('./hvymetl-agent-macos-x64');
    expect(liveAgentRunCommand('linux-x64', 'abc', 'mongodb://localhost:27017', '')).toContain('./hvymetl-agent-linux-x64');
    expect(liveAgentRunCommand('windows-x64', 'abc', 'mongodb://localhost:27017', 'shop')).toContain('.\\hvymetl-agent-windows-x64.exe');
    expect(mac).not.toContain('npx');
  });
});

describe('detectLiveAgentPlatform', () => {
  it('selects Windows, Linux, and a known Mac, and leaves an ambiguous Mac unset', () => {
    expect(detectLiveAgentPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32' })).toBe('windows-x64');
    expect(detectLiveAgentPlatform({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', platform: 'Linux x86_64' })).toBe('linux-x64');
    expect(detectLiveAgentPlatform({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'macOS', architecture: 'arm' })).toBe('macos-aarch64');
    expect(detectLiveAgentPlatform({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'macOS', architecture: 'x86' })).toBe('macos-x64');
    expect(detectLiveAgentPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel' })).toBeNull();
    expect(liveAgentDownloadUrl('linux-x64')).toBe('https://github.com/7erry/hvyMETL/releases/download/v7.7.0/hvymetl-agent-linux-x64');
  });
});
