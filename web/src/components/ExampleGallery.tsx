import { useMemo, useState } from 'react';
import type { BuiltinExampleSummary } from '../api';
import { useT } from '../i18n/LocaleContext';

type ExampleGalleryProps = {
  examples: BuiltinExampleSummary[];
  loading: boolean;
  loadingExample: boolean;
  disabled?: boolean;
  onSelect: (exampleId: string) => void | Promise<void>;
};

const VENDOR_LABELS: Record<string, string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  sqlite: 'SQLite',
  mssql: 'SQL Server',
  oracle: 'Oracle',
  dynamodb: 'DynamoDB',
};

function canonicalVendor(dialect: string): string {
  const id = dialect.toLowerCase();
  if (id === 'postgres' || id === 'postgresql') return 'postgresql';
  if (id === 'oraclesql' || id === 'oracle') return 'oracle';
  if (id === 'transactsql' || id === 'sqlserver' || id === 'mssql') return 'mssql';
  if (id === 'memsql') return 'singlestore';
  if (id === 'hana' || id === 'sap hana') return 'sap-hana';
  if (id === 'yugabytedb') return 'yugabyte';
  if (id === 'spark' || id === 'spark-sql') return 'databricks';
  if (id === 'aws-dynamodb' || id === 'dynamo-db') return 'dynamodb';
  if (id === 'jsonschema' || id === 'json_schema') return 'json-schema';
  return id;
}

function DialectGlyph({ id }: { id: string }): React.ReactElement {
  return (
    <svg className="example-gallery__dialect-glyph" viewBox="0 0 16 16" aria-hidden="true">
      {vendorGlyph(id)}
    </svg>
  );
}

function vendorGlyph(id: string): React.ReactElement {
  switch (id) {
    case 'postgresql':
      return (
        <>
          <path
            fill="#336791"
            d="M3.1 8.7c.1-1.8 1.2-3.2 2.8-3.6.2-1.3 1.3-2.2 2.6-2.2.9 0 1.7.4 2.1 1.1.7-.3 1.5.1 1.8.8.2.4.1.9-.1 1.2.9.5 1.5 1.4 1.5 2.5 0 1.7-1.5 3-3.3 3.1v1.1H9.2v-1c-.4.1-.9.1-1.3 0v1H6.6v-1.2C4.6 11.8 3.1 10.4 3.1 8.7z"
          />
          <path fill="#336791" d="M11.7 8.5c.8.4 1.2 1.3.8 2.1-.4.2-1.2.1-1.5-.5.2-.5.4-1.1.7-1.6z" />
          <circle cx="7.3" cy="6.4" r=".55" fill="#fff" />
        </>
      );
    case 'mysql':
      return (
        <>
          <path
            fill="#00758F"
            d="M2.1 9.6c1.4-3.4 4-5.4 6.8-5.4 1.1 0 2 .4 2.5 1.2-.8.1-1.4.6-1.7 1.2 1.1.4 1.8 1.2 1.9 2.1-1.6.4-3.3 0-4.7-1-1.3 1.3-3 1.8-4.8.9z"
          />
          <path fill="#F29111" d="M12.4 3.1c.7.6 1.4 1.5 1.3 2.3-.8-.2-1.4-.8-1.6-1.4z" />
          <circle cx="6.3" cy="6.5" r=".45" fill="#fff" />
        </>
      );
    case 'mariadb':
      return (
        <>
          <ellipse cx="8" cy="9.2" rx="4.3" ry="3.5" fill="#C0765A" />
          <ellipse cx="8" cy="6.4" rx="3.3" ry="2.5" fill="#E8B298" />
          <circle cx="6.6" cy="6.1" r=".55" fill="#2A1A14" />
          <circle cx="9.5" cy="6.1" r=".55" fill="#2A1A14" />
          <ellipse cx="8" cy="7.4" rx=".7" ry=".45" fill="#2A1A14" />
          <path d="M5.2 4.3c.5-.9 1.1-1 1.5-.4M10.8 4.3c-.5-.9-1.1-1-1.5-.4" stroke="#C0765A" strokeWidth="1" fill="none" />
        </>
      );
    case 'sqlite':
      return (
        <>
          <path
            fill="#0F80CC"
            d="M8.3 1.2c.2 2.1-.3 4.2-1.3 6.1 1.6.2 3 .9 4 1.9-1.8.2-3.4-.3-4.6-1.3-.8 1.6-1.2 3.2-1.1 5 .1.6.2 1.2.4 1.7-1.6-.7-2.7-2.3-2.7-4.1.1-2.4 1.2-4.6 2.6-6.6C6.3 2.8 7.3 1.8 8.3 1.2z"
          />
          <path d="M7.2 4.4c.6 1.6.8 3.3.5 5.2" stroke="#fff" strokeWidth=".7" fill="none" />
        </>
      );
    case 'mssql':
      return (
        <>
          <rect x="1" y="1" width="14" height="14" rx="2" fill="#CC2927" />
          <ellipse cx="8" cy="5.1" rx="3.6" ry="1.4" fill="#fff" />
          <path fill="#fff" d="M4.4 5.4v5.2c0 .8 1.6 1.5 3.6 1.5s3.6-.7 3.6-1.5V5.4c0 .8-1.6 1.4-3.6 1.4s-3.6-.6-3.6-1.4z" />
        </>
      );
    case 'oracle':
      return <circle cx="8" cy="8" r="5.2" fill="none" stroke="#C74634" strokeWidth="2.4" />;
    case 'dynamodb':
      return (
        <>
          <rect x="2" y="2.4" width="12" height="2.7" rx=".4" fill="#4053D6" />
          <rect x="2" y="6.6" width="12" height="2.7" rx=".4" fill="#4053D6" />
          <rect x="2" y="10.8" width="12" height="2.7" rx=".4" fill="#FF9900" />
        </>
      );
    case 'clickhouse':
      return (
        <>
          <rect x="1.5" y="9" width="3.2" height="5" fill="#F9D423" />
          <rect x="6.4" y="2" width="3.2" height="12" fill="#F9D423" />
          <rect x="11.3" y="6" width="3.2" height="8" fill="#F9D423" />
        </>
      );
    case 'cockroachdb':
      return (
        <>
          <ellipse cx="8" cy="9.3" rx="2.8" ry="3.8" fill="#6933FF" />
          <path
            d="M5.6 6.2 3.2 3.5M10.4 6.2 12.8 3.5M4.3 10.6 2.1 12M11.7 10.6 13.9 12"
            stroke="#6933FF"
            strokeWidth="1.1"
            strokeLinecap="round"
          />
          <circle cx="7" cy="8.2" r=".4" fill="#fff" />
          <circle cx="9" cy="8.2" r=".4" fill="#fff" />
        </>
      );
    case 'yugabyte':
      return (
        <>
          <circle cx="8" cy="3.1" r="1.7" fill="#7C3AED" />
          <circle cx="3.1" cy="12.8" r="1.7" fill="#7C3AED" />
          <circle cx="12.9" cy="12.8" r="1.7" fill="#7C3AED" />
          <path d="M8 4.8v3.1M8 7.9 4.4 11.4M8 7.9l3.6 3.5" stroke="#7C3AED" strokeWidth="1.3" />
        </>
      );
    case 'aurora-postgresql':
    case 'aurora-mysql':
      return (
        <>
          <circle cx="8" cy="8" r="2.1" fill="#FF9900" />
          <path
            stroke="#FF9900"
            strokeWidth="1.4"
            strokeLinecap="round"
            d="M8 1.6v2.1M8 12.3v2.1M1.6 8h2.1M12.3 8h2.1M3.3 3.3l1.5 1.5M11.2 11.2l1.5 1.5M12.7 3.3 11.2 4.8M4.8 11.2 3.3 12.7"
          />
        </>
      );
    case 'redshift':
      return (
        <>
          <circle cx="8" cy="8" r="2" fill="#8C4FFF" />
          <circle cx="3.2" cy="4" r="1.35" fill="#E2546A" />
          <circle cx="12.6" cy="4.1" r="1.35" fill="#E2546A" />
          <circle cx="3.8" cy="12.3" r="1.35" fill="#E2546A" />
          <circle cx="12.2" cy="12.1" r="1.35" fill="#E2546A" />
        </>
      );
    case 'snowflake':
      return (
        <path
          stroke="#29B5E8"
          strokeWidth="1.35"
          strokeLinecap="round"
          d="M8 1.6v12.8M2.2 4.5l11.6 7M13.8 4.5 2.2 11.5"
        />
      );
    case 'bigquery':
      return (
        <>
          <circle cx="7" cy="7" r="3.5" fill="none" stroke="#4385F4" strokeWidth="1.6" />
          <path d="m9.6 9.6 3.1 3.1" stroke="#4385F4" strokeWidth="1.6" strokeLinecap="round" />
          <rect x="5.2" y="6.1" width="1.15" height="2.6" fill="#EA4335" />
          <rect x="6.6" y="5.3" width="1.15" height="3.4" fill="#FBBC04" />
          <rect x="8" y="4.7" width="1.15" height="4" fill="#34A853" />
        </>
      );
    case 'spanner':
      return (
        <>
          <rect x="2" y="3" width="12" height="2.3" rx=".4" fill="#4285F4" />
          <rect x="2" y="6.8" width="12" height="2.3" rx=".4" fill="#34A853" />
          <rect x="2" y="10.6" width="12" height="2.3" rx=".4" fill="#FBBC04" />
        </>
      );
    case 'databricks':
      return (
        <>
          <path fill="#FF3621" d="M8 1.6 14.2 13.6H1.8L8 1.6z" />
          <path fill="#fff" d="M8 5.4 11.1 11.2H4.9L8 5.4z" />
        </>
      );
    case 'db2':
      return (
        <g fill="#0F62FE">
          <rect x="2" y="2" width="12" height="1.15" />
          <rect x="2" y="4.15" width="12" height="1.15" />
          <rect x="2" y="6.3" width="12" height="1.15" />
          <rect x="2" y="8.45" width="12" height="1.15" />
          <rect x="2" y="10.6" width="12" height="1.15" />
          <rect x="2" y="12.75" width="12" height="1.15" />
        </g>
      );
    case 'sybase':
      return (
        <>
          <path fill="#E2231A" d="M8 1.4c2.3 2.5 3.5 4.1 3.5 5.8A3.5 3.5 0 1 1 4.5 7.2C4.5 5.5 5.7 3.9 8 1.4z" />
          <path fill="#1B4F9C" d="M8 6.1c1.3 1.3 1.9 2.1 1.9 3A1.9 1.9 0 1 1 6.1 9.1c0-.9.6-1.7 1.9-3z" />
        </>
      );
    case 'sap-hana':
      return (
        <>
          <path fill="#008FD3" d="M8 1.7 14.3 13.9H1.7L8 1.7z" />
          <path fill="#fff" d="M8 5.3 11.2 11.5H4.8L8 5.3z" />
        </>
      );
    case 'singlestore':
      return (
        <path
          d="M11.3 4.2c-.7-.9-1.7-1.4-3.1-1.4-2.1 0-3.5 1.2-3.5 2.7 0 3.6 6.6 1.5 6.6 4.6 0 1.4-1.4 2.5-3.5 2.5-1.5 0-2.7-.6-3.4-1.5"
          fill="none"
          stroke="#5B2CFF"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      );
    case 'teradata':
      return (
        <>
          <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="#F15A22" />
          <circle cx="5" cy="8" r="1.15" fill="#fff" />
          <circle cx="8" cy="8" r="1.15" fill="#fff" />
          <circle cx="11" cy="8" r="1.15" fill="#fff" />
        </>
      );
    case 'firebird':
      return (
        <>
          <path fill="#E85D04" d="M1.8 9.3c2.3-.5 4-2.3 4.8-4.6.9 1.7 2.5 2.7 4.5 2.9-1.5.6-2.3 1.7-2.5 3.1-1.3-.6-2.5-.6-3.8.1C4.1 10.3 2.8 10.1 1.8 9.3z" />
          <path fill="#FFBA08" d="M9.4 6.1c1.5.2 2.7.9 3.5 1.7-.9.2-1.7 0-2.3-.5-.4-.3-.8-.7-1.2-1.2z" />
        </>
      );
    case 'json-schema':
      return (
        <path
          d="M6.2 3.1c-1.6.4-2.4 1.4-2.4 2.7 0 1.6 1.2 2.2 2.4 2.2-1.2 0-2.4.6-2.4 2.2 0 1.3.8 2.3 2.4 2.7M9.8 3.1c1.6.4 2.4 1.4 2.4 2.7 0 1.6-1.2 2.2-2.4 2.2 1.2 0 2.4.6 2.4 2.2 0 1.3-.8 2.3-2.4 2.7"
          fill="none"
          stroke="#F0C419"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      );
    default:
      return (
        <>
          <ellipse cx="8" cy="4.2" rx="5" ry="1.8" fill="none" stroke="#8FB8AE" strokeWidth="1.3" />
          <path d="M3 4.2v7.2c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V4.2" fill="none" stroke="#8FB8AE" strokeWidth="1.3" />
          <path d="M3 8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8" fill="none" stroke="#8FB8AE" strokeWidth="1.3" />
        </>
      );
  }
}

function DialectMark({ dialect }: { dialect: string }): React.ReactElement {
  const id = canonicalVendor(dialect);
  const label = VENDOR_LABELS[id] ?? dialect;
  return (
    <span className="example-gallery__dialect" title={label}>
      <DialectGlyph id={id} />
      <span className="example-gallery__dialect-label">{label}</span>
    </span>
  );
}

function categoryLabel(category: string): string {
  if (category === 'studio') return 'Studio';
  if (category === 'saas') return 'SaaS';
  return category
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function ExampleGallery({
  examples,
  loading,
  loadingExample,
  disabled = false,
  onSelect,
}: ExampleGalleryProps): React.ReactElement {
  const t = useT();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const example of examples) {
      const key = example.source === 'drawdb' ? (example.category ?? 'general') : 'studio';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([id, count]) => ({ id, count, label: categoryLabel(id) }))
      .sort((a, b) => {
        if (a.id === 'studio') return -1;
        if (b.id === 'studio') return 1;
        return a.label.localeCompare(b.label);
      });
  }, [examples]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return examples.filter((example) => {
      const exampleCategory = example.source === 'drawdb' ? (example.category ?? 'general') : 'studio';
      if (category !== 'all' && exampleCategory !== category) return false;
      if (!needle) return true;
      const haystack = [
        example.label,
        example.description,
        example.dialect,
        example.primaryDialect ?? '',
        exampleCategory,
        ...(example.tags ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [examples, query, category]);

  return (
    <div className="example-gallery">
      <div className="example-gallery__toolbar">
        <input
          type="search"
          className="example-gallery__search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('schema.gallerySearch')}
          disabled={disabled || loading}
          aria-label={t('schema.gallerySearch')}
        />
        <div className="example-gallery__chips" role="tablist" aria-label={t('schema.galleryCategories')}>
          <button
            type="button"
            role="tab"
            aria-selected={category === 'all'}
            className={`example-gallery__chip${category === 'all' ? ' is-active' : ''}`}
            onClick={() => setCategory('all')}
          >
            {t('schema.galleryAll')} ({examples.length})
          </button>
          {categories.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={category === item.id}
              className={`example-gallery__chip${category === item.id ? ' is-active' : ''}`}
              onClick={() => setCategory(item.id)}
            >
              {item.id === 'studio' ? t('schema.galleryStudio') : item.label} ({item.count})
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="example-gallery__empty">{t('common.loading')}</p>
      ) : filtered.length === 0 ? (
        <p className="example-gallery__empty">{t('schema.galleryEmpty')}</p>
      ) : (
        <div className="example-gallery__grid">
          {filtered.map((example) => {
            const dialect = example.primaryDialect ?? example.dialect;
            const chipCategory =
              example.source === 'drawdb' ? (example.category ?? 'general') : 'studio';
            return (
              <button
                key={example.id}
                type="button"
                className="example-gallery__card"
                disabled={disabled || loadingExample}
                onClick={() => void onSelect(example.id)}
              >
                <div className="example-gallery__preview">
                  {example.previewUrl ? (
                    <img src={example.previewUrl} alt="" loading="lazy" />
                  ) : (
                    <div className="example-gallery__preview-fallback" aria-hidden="true" />
                  )}
                </div>
                <div className="example-gallery__meta">
                  <div className="example-gallery__meta-row">
                    <DialectMark dialect={dialect} />
                    <span className="example-gallery__category">{categoryLabel(chipCategory)}</span>
                  </div>
                  <h4 className="example-gallery__title">{example.label}</h4>
                  <p className="example-gallery__description">{example.description}</p>
                  {typeof example.tableCount === 'number' && example.tableCount > 0 ? (
                    <p className="example-gallery__stats">
                      {t('schema.galleryTables', { count: example.tableCount })}
                    </p>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
