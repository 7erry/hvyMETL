import { useState } from 'react';
import {
  listLiveImportConnections,
  type LiveImportConnection,
} from '../liveImportConnections';
import { liveImportEngineFromUri } from '../liveConnectionUri';
import { SavedLiveImportConnectionField } from './SavedLiveImportConnectionField';

type LivePipelineFieldsProps = {
  uri: string;
  database: string;
  disabled: boolean;
  onChange: (next: { uri: string; database: string }) => void;
};

/** Connection fields for one pipeline run. Saved picks reuse Live Import connections. */
export function LivePipelineFields({ uri, database, disabled, onChange }: LivePipelineFieldsProps) {
  const [connections, setConnections] = useState<LiveImportConnection[]>(() =>
    listLiveImportConnections(),
  );
  const [connectionId, setConnectionId] = useState('');

  const applyConnection = (saved: LiveImportConnection): void => {
    onChange({ uri: saved.uri, database: saved.database });
  };

  return (
    <div className="pipeline-card">
      <p className="pipeline-hint">
        Up to 1,000 rows per SQL table, or 50 documents per MongoDB collection. Saved connections
        are shared with Live Import and stay in this browser.
      </p>
      <SavedLiveImportConnectionField
        connections={connections}
        connectionId={connectionId}
        onConnectionIdChange={setConnectionId}
        onConnectionsChange={setConnections}
        draftUri={uri}
        draftDatabase={database}
        draftEngine={liveImportEngineFromUri(uri) ?? 'postgresql'}
        onApplyConnection={applyConnection}
        disabled={disabled}
      />
      <label>
        Connection URI
        <input
          value={uri}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          placeholder="postgresql://localhost:5432/shop"
          onChange={(event) => {
            setConnectionId('');
            onChange({ uri: event.target.value, database });
          }}
        />
      </label>
      <label>
        Database
        <input
          value={database}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          placeholder="Uses the database in the URI when empty"
          onChange={(event) => {
            setConnectionId('');
            onChange({ uri, database: event.target.value });
          }}
        />
      </label>
    </div>
  );
}
