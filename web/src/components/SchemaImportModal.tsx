import type { Dialect } from '../types';
import { SchemaImportPanel } from './SchemaImportPanel';

type SchemaImportModalProps = {
  open: boolean;
  dialects: Dialect[];
  dialect: string;
  ddl: string;
  apiConnected: boolean;
  onDialectChange: (dialect: string) => void;
  onDdlChange: (ddl: string) => void;
  onImportQuery: () => void;
  onSchemaFile: (file: File) => void;
  onImportBuiltinExample?: (exampleId: string) => void | Promise<void>;
  onClose: () => void;
};

/** First-step wizard modal: every migration starts by importing source schema. */
export function SchemaImportModal({
  open,
  dialects,
  dialect,
  ddl,
  apiConnected,
  onDialectChange,
  onDdlChange,
  onImportQuery,
  onSchemaFile,
  onImportBuiltinExample,
  onClose,
}: SchemaImportModalProps) {
  if (!open) return null;

  return (
    <div className="pipeline-overlay" role="dialog" aria-modal="true" aria-labelledby="schema-import-modal-title">
      <div className="pipeline-modal panel schema-import-modal">
        <header className="pipeline-modal__header">
          <div>
            <h2 id="schema-import-modal-title">Start with schema import</h2>
            <p className="pipeline-modal__subtitle">
              Paste DDL or upload a schema file so hvyMETL can build the source ER model before design, cost, or ETL.
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close schema import dialog">
            ✕
          </button>
        </header>

        <SchemaImportPanel
          dialects={dialects}
          dialect={dialect}
          ddl={ddl}
          apiConnected={apiConnected}
          onDialectChange={onDialectChange}
          onDdlChange={onDdlChange}
          onImportQuery={onImportQuery}
          onSchemaFile={onSchemaFile}
          onImportBuiltinExample={onImportBuiltinExample}
          framed={false}
        />
      </div>
    </div>
  );
}
