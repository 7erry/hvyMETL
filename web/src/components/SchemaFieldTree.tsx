import { Handle, Position } from '@xyflow/react';
import { useCallback, useMemo, useState } from 'react';
import type { CollectionPlan } from '../migrationPlanTypes';
import type { SchemaField } from '../schema/schemaFields';
import { mongoFieldTagPrefix } from '../fieldTagIcons';

type SchemaFieldTreeProps = {
  fields: SchemaField[];
  collection: CollectionPlan;
  /** When set, controls expansion (ERD). Omit for local inspector state. */
  expandedPaths?: Set<string>;
  onTogglePath?: (path: string) => void;
  /** Compact rows for collection diagram nodes. */
  variant?: 'inspector' | 'node';
  /** Top-level field names that emit diagram edges (node variant only). */
  linkFields?: Set<string>;
};

function isEmbedContainerField(field: SchemaField): boolean {
  if (field.tags?.includes('embed') || field.tags?.includes('denorm')) return true;
  return field.type.startsWith('array<') || field.type === 'object';
}

function fieldRowPaddingLeft(
  depth: number,
  nestedUnderEmbed: boolean,
  variant: 'inspector' | 'node',
): string | undefined {
  if (depth < 1) return undefined;
  if (variant === 'node') {
    if (nestedUnderEmbed) {
      return `calc(1.85rem + ${depth - 1} * 1.2rem)`;
    }
    return `calc(1.25rem + ${depth - 1} * 1rem)`;
  }
  if (nestedUnderEmbed) {
    return `calc(0.85rem + ${depth} * 1.15rem)`;
  }
  return `calc(0.5rem + ${depth} * 0.9rem)`;
}

function embedJoinHint(collection: CollectionPlan, field: SchemaField): string | null {
  if (!field.tags?.includes('embed')) return null;
  const embed = collection.embeddedArrays.find((entry) => entry.field === field.name);
  if (!embed) return null;
  return `from ${embed.sourceTable}.${embed.joinColumn}`;
}

function SchemaFieldTreeRow({
  field,
  collection,
  depth,
  nestedUnderEmbed,
  expandedPaths,
  onTogglePath,
  variant,
  linkFields,
}: {
  field: SchemaField;
  collection: CollectionPlan;
  depth: number;
  nestedUnderEmbed: boolean;
  expandedPaths: Set<string>;
  onTogglePath: (path: string) => void;
  variant: 'inspector' | 'node';
  linkFields?: Set<string>;
}) {
  const hasChildren = Boolean(field.children?.length);
  const expanded = hasChildren && expandedPaths.has(field.path);
  const hint = depth === 0 ? embedJoinHint(collection, field) : null;
  const rowClass = [
    field.tags?.includes('id') ? 'pk' : '',
    field.tags?.includes('embed') ? 'embed' : '',
    field.tags?.includes('denorm') ? 'denorm' : '',
    variant === 'node' ? 'schema-field-tree__node-row' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const isLink = depth === 0 && linkFields?.has(field.name);

  if (variant === 'node') {
    return (
      <>
        <li
          className={[rowClass, isLink ? 'linked' : ''].filter(Boolean).join(' ')}
          style={{ paddingLeft: depth > 0 ? `calc(${depth} * var(--schema-nest, 0.65rem))` : undefined }}
        >
          {hasChildren ? (
            <button
              type="button"
              className="schema-field-tree__toggle"
              aria-expanded={expanded}
              aria-label={expanded ? `Collapse ${field.name}` : `Expand ${field.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onTogglePath(field.path);
              }}
            >
              {expanded ? '▾' : '▸'}
            </button>
          ) : (
            <span className="schema-field-tree__toggle-spacer" aria-hidden />
          )}
          <span className="column-name">
            {mongoFieldTagPrefix(field.tags ?? [])}
            {field.name}
          </span>
          <span className="column-type" title={field.type}>
            {field.type}
          </span>
          {isLink ? (
            <Handle
              type="source"
              position={Position.Right}
              id={`${field.name}-out`}
              className="column-handle column-handle--out"
              title={`Linked field (${field.name})`}
            />
          ) : null}
        </li>
        {expanded && field.children
          ? field.children.map((child) => (
              <SchemaFieldTreeRow
                key={child.path}
                field={child}
                collection={collection}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                onTogglePath={onTogglePath}
                variant={variant}
                linkFields={linkFields}
              />
            ))
          : null}
      </>
    );
  }

  return (
    <>
      <tr className={rowClass}>
        <td className="schema-field-tree__name-cell" style={{ paddingLeft: `calc(0.5rem + ${depth} * 0.75rem)` }}>
          {hasChildren ? (
            <button
              type="button"
              className="schema-field-tree__toggle schema-field-tree__toggle--table"
              aria-expanded={expanded}
              aria-label={expanded ? `Collapse ${field.name}` : `Expand ${field.name}`}
              onClick={() => onTogglePath(field.path)}
            >
              {expanded ? '▾' : '▸'}
            </button>
          ) : (
            <span className="schema-field-tree__toggle-spacer" aria-hidden />
          )}
          <span>
            {mongoFieldTagPrefix(field.tags ?? [])}
            {field.name}
          </span>
          {hint ? <div className="schema-field-tree__embed-hint">{hint}</div> : null}
        </td>
        <td>{field.type}</td>
        <td>{field.tags?.join(', ') ?? '—'}</td>
      </tr>
      {expanded && field.children
        ? field.children.map((child) => (
            <SchemaFieldTreeRow
              key={child.path}
              field={child}
              collection={collection}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              onTogglePath={onTogglePath}
              variant={variant}
            />
          ))
        : null}
    </>
  );
}

/** Collapsible nested field tree for collection inspector and ERD nodes. */
export function SchemaFieldTree({
  fields,
  collection,
  expandedPaths: controlledExpanded,
  onTogglePath,
  variant = 'inspector',
  linkFields,
}: SchemaFieldTreeProps) {
  const [localExpanded, setLocalExpanded] = useState<Set<string>>(() => new Set());

  const expandedPaths = controlledExpanded ?? localExpanded;

  const togglePath = useCallback(
    (path: string) => {
      if (onTogglePath) {
        onTogglePath(path);
        return;
      }
      setLocalExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    },
    [onTogglePath],
  );

  const rows = useMemo(
    () =>
      fields.map((field) => (
        <SchemaFieldTreeRow
          key={field.path}
          field={field}
          collection={collection}
          depth={0}
          expandedPaths={expandedPaths}
          onTogglePath={togglePath}
          variant={variant}
          linkFields={linkFields}
        />
      )),
    [fields, collection, expandedPaths, togglePath, variant, linkFields],
  );

  if (variant === 'node') {
    return <>{rows}</>;
  }

  return (
    <table className="details-table schema-field-tree">
      <thead>
        <tr>
          <th>Field</th>
          <th>BSON type</th>
          <th>Tags</th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
  );
}
