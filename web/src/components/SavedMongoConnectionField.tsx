import { useState, type ReactElement } from 'react';
import { describeApiError } from '../api';
import { useT } from '../i18n/LocaleContext';
import {
  deleteMongoShellConnection,
  listMongoShellConnections,
  upsertMongoShellConnection,
  type MongoShellConnection,
} from '../mongoShellConnections';

export type SavedMongoConnectionFieldProps = {
  connections: MongoShellConnection[];
  connectionId: string;
  onConnectionIdChange: (id: string) => void;
  onConnectionsChange: (next: MongoShellConnection[]) => void;
  fieldClassName: string;
  label: string;
  emptyLabel: string;
};

type FormState = { id?: string; name: string; uri: string };

export function SavedMongoConnectionField({
  connections,
  connectionId,
  onConnectionIdChange,
  onConnectionsChange,
  fieldClassName,
  label,
  emptyLabel,
}: SavedMongoConnectionFieldProps): ReactElement {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>({ name: '', uri: '' });
  const [formError, setFormError] = useState('');

  const selected = connections.find((c) => c.id === connectionId) ?? null;

  const refresh = (): MongoShellConnection[] => {
    const next = listMongoShellConnections();
    onConnectionsChange(next);
    if (connectionId && !next.some((c) => c.id === connectionId)) {
      onConnectionIdChange(next[0]?.id ?? '');
    }
    return next;
  };

  const startCreate = (): void => {
    setForm({ name: '', uri: '' });
    setFormError('');
    setEditing(true);
  };

  const startEdit = (): void => {
    if (!selected) return;
    setForm({ id: selected.id, name: selected.name, uri: selected.uri });
    setFormError('');
    setEditing(true);
  };

  const cancelEdit = (): void => {
    setEditing(false);
    setForm({ name: '', uri: '' });
    setFormError('');
  };

  const saveConnection = (): void => {
    try {
      const saved = upsertMongoShellConnection(form);
      const next = refresh();
      onConnectionIdChange(next.some((c) => c.id === saved.id) ? saved.id : (next[0]?.id ?? ''));
      setEditing(false);
      setForm({ name: '', uri: '' });
      setFormError('');
    } catch (error) {
      setFormError(describeApiError(error));
    }
  };

  const removeConnection = (): void => {
    if (!selected) return;
    if (!window.confirm(t('connections.deleteConfirm', { name: selected.name }))) return;
    deleteMongoShellConnection(selected.id);
    const next = refresh();
    onConnectionIdChange(next[0]?.id ?? '');
    setEditing(false);
    setFormError('');
  };

  return (
    <div className={editing ? 'saved-mongo-conn saved-mongo-conn--editing' : 'saved-mongo-conn'}>
      <label className={fieldClassName}>
        <span>{label}</span>
        <div className="saved-mongo-conn__row">
          <select
            value={connectionId}
            aria-label={label}
            onChange={(e) => onConnectionIdChange(e.target.value)}
            onFocus={refresh}
          >
            {connections.length === 0 ? (
              <option value="">{emptyLabel}</option>
            ) : (
              connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.id}
                </option>
              ))
            )}
          </select>
          <button type="button" className="tertiary" onClick={startCreate}>
            {t('connections.add')}
          </button>
          <button type="button" className="tertiary" disabled={!selected} onClick={startEdit}>
            {t('connections.edit')}
          </button>
          <button
            type="button"
            className="danger secondary"
            disabled={!selected}
            onClick={removeConnection}
          >
            {t('connections.delete')}
          </button>
        </div>
      </label>

      {editing ? (
        <div className="saved-mongo-conn__form">
          <label>
            {t('connections.name')}
            <input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={t('connections.namePlaceholder')}
            />
          </label>
          <label>
            {t('connections.uri')}
            <input
              value={form.uri}
              onChange={(e) => setForm((prev) => ({ ...prev, uri: e.target.value }))}
              placeholder={t('connections.uriPlaceholder')}
              spellCheck={false}
            />
          </label>
          {formError ? <p className="saved-mongo-conn__error">{formError}</p> : null}
          <div className="button-row">
            <button type="button" className="primary" onClick={saveConnection}>
              {t('common.save')}
            </button>
            <button type="button" className="secondary" onClick={cancelEdit}>
              {t('common.cancel')}
            </button>
          </div>
          <p className="saved-mongo-conn__hint">{t('connections.storageHint')}</p>
        </div>
      ) : null}
    </div>
  );
}
