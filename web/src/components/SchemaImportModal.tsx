import type { Dialect } from '../types';
import { useT } from '../i18n/LocaleContext';
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
  onImportLive: (uri: string, database: string, platform: string) => void | Promise<string | void>;
  status?: string;
  onSchemaFiles: (files: File[]) => void;
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
  onImportLive,
  status,
  onSchemaFiles,
  onImportBuiltinExample,
  onClose,
}: SchemaImportModalProps) {
  const t = useT();
  if (!open) return null;

  return (
    <div className="pipeline-overlay" role="dialog" aria-modal="true" aria-labelledby="schema-import-modal-title">
      <div className="pipeline-modal panel schema-import-modal">
        <header className="pipeline-modal__header">
          <div>
            <h2 id="schema-import-modal-title">{t('schema.modalTitle')}</h2>
            <p className="pipeline-modal__subtitle">{t('schema.modalSubtitle')}</p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label={t('schema.modalClose')}>
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
          onImportLive={onImportLive}
          status={status}
          onSchemaFiles={onSchemaFiles}
          onImportBuiltinExample={onImportBuiltinExample}
          framed={false}
        />
      </div>
    </div>
  );
}
