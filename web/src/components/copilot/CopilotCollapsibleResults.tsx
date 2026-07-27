import type { ReactNode } from 'react';

type CopilotCollapsibleResultsProps = {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
};

/** Collapsible copilot results panel — matches copilot-details styling used elsewhere. */
export function CopilotCollapsibleResults({
  summary,
  children,
  className,
  defaultOpen = true,
}: CopilotCollapsibleResultsProps) {
  const classes = ['copilot-details', 'copilot-results', className].filter(Boolean).join(' ');

  return (
    <details className={classes} open={defaultOpen}>
      <summary className="copilot-details__summary">{summary}</summary>
      <div className="copilot-results__body">{children}</div>
    </details>
  );
}

type ScrollableInspectTableProps = {
  caption?: string;
  columns: string[];
  rows: Record<string, string>[];
  rowKey: (row: Record<string, string>, index: number) => string;
  rowClassName?: (row: Record<string, string>, index: number) => string | undefined;
  scrollVariant?: 'inline' | 'panel';
};

function formatCellValue(value: string): { display: string; title?: string } {
  if (value.length <= 96) {
    return { display: value };
  }
  return { display: `${value.slice(0, 93)}…`, title: value };
}

/** Scrollable table wrapper shared by Mongo inspect and analyze result views. */
export function ScrollableInspectTable({
  caption,
  columns,
  rows,
  rowKey,
  rowClassName,
  scrollVariant = 'inline',
}: ScrollableInspectTableProps) {
  const scrollClass =
    scrollVariant === 'panel'
      ? 'copilot-inspect-table-wrap copilot-inspect-table-wrap--scroll copilot-inspect-table-wrap--panel'
      : 'copilot-inspect-table-wrap copilot-inspect-table-wrap--scroll';

  return (
    <div className={scrollClass}>
      <table className="copilot-inspect-table">
        {caption ? <caption className="copilot-inspect-table__caption">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)} className={rowClassName?.(row, index)}>
              {columns.map((column) => {
                const raw = row[column] ?? '—';
                const { display, title } = formatCellValue(raw);
                return (
                  <td key={column} title={title}>
                    <code>{display}</code>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
