/** Browser save / load / library / history for mongosh scripts. */

const HISTORY_KEY = 'hvymetl.mongosh.scriptHistory';
const LIBRARY_KEY = 'hvymetl.mongosh.scriptLibrary';
const MAX_HISTORY = 40;

export type MongoShellHistoryEntry = {
  id: string;
  preview: string;
  script: string;
  savedAt: number;
};

export type MongoShellLibraryEntry = {
  id: string;
  name: string;
  project: string;
  script: string;
  updatedAt: number;
};

function previewOf(script: string): string {
  const line = script.split(/\r?\n/).find((l) => l.trim() && !l.trim().startsWith('//')) ?? script;
  return line.trim().slice(0, 72) || '(empty)';
}

function readJsonArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function listMongoShellHistory(): MongoShellHistoryEntry[] {
  return readJsonArray<MongoShellHistoryEntry>(HISTORY_KEY);
}

export function pushMongoShellHistory(script: string): void {
  const trimmed = script.trim();
  if (!trimmed) return;
  const prev = listMongoShellHistory().filter((e) => e.script !== script);
  const next: MongoShellHistoryEntry[] = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      preview: previewOf(script),
      script,
      savedAt: Date.now(),
    },
    ...prev,
  ].slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

export function listMongoShellLibrary(): MongoShellLibraryEntry[] {
  return readJsonArray<MongoShellLibraryEntry>(LIBRARY_KEY).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );
}

export function upsertMongoShellLibraryEntry(input: {
  id?: string;
  name: string;
  project?: string;
  script: string;
}): MongoShellLibraryEntry {
  const name = input.name.trim();
  if (!name) throw new Error('Script name is required.');
  const script = input.script;
  if (!script.trim()) throw new Error('Script is empty.');
  const project = (input.project ?? 'default').trim() || 'default';
  const all = listMongoShellLibrary();
  const id = input.id?.trim() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: MongoShellLibraryEntry = {
    id,
    name,
    project,
    script,
    updatedAt: Date.now(),
  };
  const next = [entry, ...all.filter((e) => e.id !== id)];
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(next));
  return entry;
}

export function deleteMongoShellLibraryEntry(id: string): void {
  const next = listMongoShellLibrary().filter((e) => e.id !== id);
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(next));
}

export function exportMongoShellLibraryJson(): string {
  return JSON.stringify({ version: 1, scripts: listMongoShellLibrary() }, null, 2);
}

export function importMongoShellLibraryJson(raw: string): number {
  const parsed = JSON.parse(raw) as { scripts?: MongoShellLibraryEntry[] } | MongoShellLibraryEntry[];
  const incoming = Array.isArray(parsed) ? parsed : parsed.scripts;
  if (!Array.isArray(incoming)) throw new Error('Invalid library JSON.');
  let added = 0;
  for (const item of incoming) {
    if (!item || typeof item.script !== 'string' || typeof item.name !== 'string') continue;
    upsertMongoShellLibraryEntry({
      name: item.name,
      project: typeof item.project === 'string' ? item.project : 'default',
      script: item.script,
    });
    added += 1;
  }
  return added;
}

export function downloadMongoShellScript(script: string, fileName = 'shell.js'): void {
  const blob = new Blob([script], { type: 'text/javascript;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadTextFile(contents: string, fileName: string, mime: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function readMongoShellScriptFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
