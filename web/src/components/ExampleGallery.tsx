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

function DialectMark({ dialect }: { dialect: string }): React.ReactElement {
  const id = dialect.toLowerCase();
  const label =
    id === 'postgresql' || id === 'postgres'
      ? 'PostgreSQL'
      : id === 'mysql'
        ? 'MySQL'
        : id === 'mariadb'
          ? 'MariaDB'
          : id === 'sqlite'
            ? 'SQLite'
            : id === 'mssql' || id === 'sqlserver'
              ? 'SQL Server'
              : id === 'oracle'
                ? 'Oracle'
                : id === 'dynamodb'
                  ? 'DynamoDB'
                  : dialect;
  const tone =
    id === 'postgresql' || id === 'postgres'
      ? 'pg'
      : id === 'mysql' || id === 'mariadb'
        ? 'mysql'
        : id === 'sqlite'
          ? 'sqlite'
          : id === 'mssql' || id === 'sqlserver'
            ? 'mssql'
            : id === 'oracle'
              ? 'oracle'
              : 'generic';
  return (
    <span className={`example-gallery__dialect example-gallery__dialect--${tone}`} title={label}>
      <span className="example-gallery__dialect-glyph" aria-hidden="true" />
      <span className="example-gallery__dialect-label">{label}</span>
    </span>
  );
}

function categoryLabel(category: string): string {
  if (category === 'studio') return 'Studio';
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
