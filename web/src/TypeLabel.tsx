import type { ReactElement } from 'react';
import { columnTypeClass } from './typeHighlight';

/** Type text on an ER card. A union colors each side, so `long | null` is not one color. */
export function TypeLabel({ type }: { type: string }): ReactElement {
  const parts = type.split(/(\s*\|\s*)/);
  if (parts.length === 1) {
    return (
      <span className={columnTypeClass(type)} title={type}>
        {type}
      </span>
    );
  }
  return (
    <span className="column-type column-type--mixed" title={type}>
      {parts.map((part, index) =>
        part.includes('|') ? (
          <span key={index} className="column-type__sep">
            {part}
          </span>
        ) : (
          <span key={index} className={columnTypeClass(part.trim())}>
            {part}
          </span>
        ),
      )}
    </span>
  );
}
