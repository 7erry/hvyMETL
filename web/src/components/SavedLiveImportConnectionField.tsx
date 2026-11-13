import { useState, type ReactElement } from 'react';
import { describeApiError } from '../api';
import { useT } from '../i18n/LocaleContext';
import type { MessageKey } from '../i18n/messages';
import {
  deleteLiveImportConnection,
  listLiveImportConnections,
  upsertLiveImportConnection,
  type LiveImportConnection,
  type LiveImportEngine,
} from '../liveImportConnections';
import { liveConnectionDisplayHost, liveImportEngineFromUri } from '../liveConnectionUri';

const ENGINE_LABEL_KEYS: Record<LiveImportEngine, MessageKey> = {
  mongodb: 'live.engine.mongodb',
  postgresql: 'live.engine.postgresql',
  mysql: 'live.engine.mysql',
  mssql: 'live.engine.mssql',
  sqlite: 'live.engine.sqlite',
};

const ENGINES: LiveImportEngine[] = ['postgresql', 'mysql', 'mssql', 'mongodb', 'sqlite'];

type ConnFormState = {
  id?: string;
  name: string;
  engine: LiveImportEngine;
  uri: string;
  database: string;
};

export type SavedLiveImportConnectionFieldProps = {
  connections: LiveImportConnection[];
  connectionId: string;
  onConnectionIdChange: (id: string) => void;
  onConnectionsChange: (next: LiveImportConnection[]) => void;
  /** Prefill for "+ New". */
  draftUri: string;
  draftDatabase: string;
  draftEngine?: LiveImportEngine;
  onApplyConnection: (connection: LiveImportConnection) => void;
  disabled?: boolean;
};

function connectionLabel(c: LiveImportConnection): string {
  const host = liveConnectionDisplayHost(c.uri, c.engine);
  return `${c.name || c.id} (${host})`;
}

function engineFromSelect(value: string): LiveImportEngine {
  switch (value) {
    case 'postgresql':
    case 'mysql':
    case 'mssql':
    case 'sqlite':
    case 'mongodb':
      return value;
    default:
      return 'postgresql';
  }
}

/** Shared saved-connection picker for Live Import and Run pipeline live reads. */
export function SavedLiveImportConnectionField({
  connections,
  connectionId,
  onConnectionIdChange,
  onConnectionsChange,
  draftUri,
  draftDatabase,
  draftEngine = 'postgresql',
  onApplyConnection,
  disabled = false,
}: SavedLiveImportConnectionFieldProps): ReactElement {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [connForm, setConnForm] = useState<ConnFormState>({
    name: '',
    engine: draftEngine,
    uri: '',
    database: '',
  });
  const [connError, setConnError] = useState('');

  const selected = connections.find((c) => c.id === connectionId) ?? null;

  const refresh = (): LiveImportConnection[] => {
    const next = listLiveImportConnections();
    onConnectionsChange(next);
    if (connectionId && !next.some((c) => c.id === connectionId)) {
      onConnectionIdChange(next[0]?.id ?? '');
    }
    return next;
  };

  const startCreate = (): void => {
    setConnForm({
      name: '',
      engine: liveImportEngineFromUri(draftUri) ?? draftEngine,
      uri: draftUri,
      database: draftDatabase,
    });
    setConnError('');
    setEditing(true);
    setManageOpen(false);
  };

  const startEdit = (): void => {
    if (!selected) return;
    setConnForm({
      id: selected.id,
      name: selected.name,
      engine: selected.engine,
      uri: selected.uri,
      database: selected.database,
    });
    setConnError('');
    setEditing(true);
    setManageOpen(false);
  };

  const cancelEdit = (): void => {
    setEditing(false);
    setConnError('');
  };

  const saveConnection = (): void => {
    try {
      const saved = upsertLiveImportConnection({
        id: connForm.id,
        name: connForm.name,
        engine: connForm.engine,
        uri: connForm.uri,
        database: connForm.database,
      });
      const next = refresh();
      onConnectionIdChange(next.some((c) => c.id === saved.id) ? saved.id : (next[0]?.id ?? ''));
      onApplyConnection(saved);
      setEditing(false);
      setConnError('');
    } catch (error) {
      setConnError(describeApiError(error));
    }
  };

  const removeConnection = (): void => {
    if (!selected) return;
    if (!window.confirm(t('connections.deleteConfirm', { name: selected.name }))) return;
    deleteLiveImportConnection(selected.id);
    const next = refresh();
    onConnectionIdChange(next[0]?.id ?? '');
    setEditing(false);
    setManageOpen(false);
    setConnError('');
  };

  return (
    <div className="saved-live-import-conn">
      <div className="live-mongo-import__saved-row">
        <span className="live-mongo-import__saved-label">{t('live.savedLabel')}</span>
        <select
          className="live-mongo-import__saved-select"
          value={connectionId}
          aria-label={t('live.savedConnections')}
          disabled={disabled}
          onChange={(e) => {
            const id = e.target.value;
            onConnectionIdChange(id);
            const saved = connections.find((c) => c.id === id);
            if (saved) onApplyConnection(saved);
          }}
          onFocus={refresh}
        >
          {connections.length === 0 ? (
            <option value="">{t('live.noSavedConnections')}</option>
          ) : (
            <>
              <option value="">{t('live.manualConnection')}</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {connectionLabel(c)}
                </option>
              ))}
            </>
          )}
        </select>
        <button
          type="button"
          className="live-mongo-import__new-btn"
          disabled={disabled}
          onClick={startCreate}
        >
          {t('live.newConnection')}
        </button>
        <div className="live-mongo-import__manage">
          <button
            type="button"
            className="live-mongo-import__manage-btn"
            aria-label={t('live.manageMenu')}
            aria-expanded={manageOpen}
            disabled={disabled}
            onClick={() => setManageOpen((v) => !v)}
          >
            …
          </button>
          {manageOpen ? (
            <div className="live-mongo-import__manage-menu" role="menu">
              <button type="button" role="menuitem" disabled={!selected} onClick={startEdit}>
                {t('connections.edit')}
              </button>
              <button type="button" role="menuitem" disabled={!selected} onClick={removeConnection}>
                {t('connections.delete')}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {editing ? (
        <div className="saved-mongo-conn__form">
          <label>
            {t('connections.name')}
            <input
              value={connForm.name}
              disabled={disabled}
              onChange={(e) => setConnForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={t('connections.namePlaceholder')}
            />
          </label>
          <label>
            {t('live.engine')}
            <select
              value={connForm.engine}
              disabled={disabled}
              onChange={(e) =>
                setConnForm((prev) => ({ ...prev, engine: engineFromSelect(e.target.value) }))
              }
            >
              {ENGINES.map((engine) => (
                <option key={engine} value={engine}>
                  {t(ENGINE_LABEL_KEYS[engine])}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('live.uri')}
            <input
              value={connForm.uri}
              disabled={disabled}
              onChange={(e) => setConnForm((prev) => ({ ...prev, uri: e.target.value }))}
              placeholder="postgresql://localhost:5432/shop"
              spellCheck={false}
            />
          </label>
          <label>
            {t('live.database')}
            <input
              value={connForm.database}
              disabled={disabled}
              onChange={(e) => setConnForm((prev) => ({ ...prev, database: e.target.value }))}
              placeholder={t('live.databasePlaceholder')}
              spellCheck={false}
            />
          </label>
          {connError ? <p className="saved-mongo-conn__error">{connError}</p> : null}
          <div className="button-row">
            <button type="button" className="primary" disabled={disabled} onClick={saveConnection}>
              {t('common.save')}
            </button>
            <button type="button" className="secondary" disabled={disabled} onClick={cancelEdit}>
              {t('common.cancel')}
            </button>
          </div>
          <p className="saved-mongo-conn__hint">{t('live.storageHint')}</p>
        </div>
      ) : null}
    </div>
  );
}
