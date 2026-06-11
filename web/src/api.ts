import type { DiagramExport, Dialect, Profile, SqlStructuralModel } from './types';

const base = '';

export async function fetchProfiles(): Promise<Profile[]> {
  const res = await fetch(`${base}/api/profiles`);
  return res.json();
}

export async function fetchDialects(): Promise<Dialect[]> {
  const res = await fetch(`${base}/api/dialects`);
  return res.json();
}

export async function importDdl(ddl: string, dialect: string): Promise<{ model: SqlStructuralModel; ddl: string }> {
  const res = await fetch(`${base}/api/schema/import-ddl`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ddl, dialect }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  const data = await res.json();
  return { model: data.model, ddl };
}

export async function importSqlite(file: File): Promise<{ model: SqlStructuralModel; ddl: string }> {
  const body = new FormData();
  body.append('database', file);
  const res = await fetch(`${base}/api/schema/import-sqlite`, { method: 'POST', body });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export async function runDesign(model: SqlStructuralModel, profileId: string, ddl: string) {
  const res = await fetch(`${base}/api/design`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, profileId, ddl }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export async function exportMigration(model: SqlStructuralModel, profileId: string, ddl: string) {
  const res = await fetch(`${base}/api/export/migration`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, profileId, ddl }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export async function exportPrompts(ddl: string, profileId: string) {
  const res = await fetch(`${base}/api/export/prompts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ddl, profileId }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export async function fetchTemplates(): Promise<{ id: string; name: string; ddl: string; model: SqlStructuralModel }[]> {
  const res = await fetch(`${base}/api/templates`);
  return res.json();
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadText(filename: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type { DiagramExport };
