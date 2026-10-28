import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from 'react';
import {
  buildResultTree,
  type ResultTreeNode,
} from '../mongoShellResultModel';

type MongoShellResultTreeProps = {
  documents: Record<string, unknown>[];
};

type ColKey = 'key' | 'value' | 'type';

const DEFAULT_WIDTHS: Record<ColKey, number> = { key: 280, value: 420, type: 140 };
const MIN_COL = 72;
const DEFAULT_PAGE_SIZE = 20;
const ROW_ESTIMATE_PX = 28;
const THEAD_ESTIMATE_PX = 36;

function TreeRows({
  node,
  depth,
}: {
  node: ResultTreeNode;
  depth: number;
}): ReactElement {
  const hasChildren = Boolean(node.children?.length);
  // Keep docs collapsed so one document ≈ one row for paging density
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr className="mongo-shell-tree__row">
        <td className="mongo-shell-tree__key" style={{ paddingLeft: `${0.5 + depth * 0.85}rem` }}>
          {hasChildren ? (
            <button
              type="button"
              className="mongo-shell-tree__toggle"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? '▾' : '▸'}
            </button>
          ) : (
            <span className="mongo-shell-tree__toggle-spacer" />
          )}
          <span>{node.key}</span>
        </td>
        <td className="mongo-shell-tree__value">{node.value}</td>
        <td className="mongo-shell-tree__type">{node.type}</td>
      </tr>
      {open && hasChildren
        ? node.children!.map((child) => (
            <TreeRows key={child.id} node={child} depth={depth + 1} />
          ))
        : null}
    </>
  );
}

export function pageSizeFromViewport(heightPx: number): number {
  const usable = Math.max(0, heightPx - THEAD_ESTIMATE_PX);
  return Math.max(5, Math.min(100, Math.floor(usable / ROW_ESTIMATE_PX) || DEFAULT_PAGE_SIZE));
}

function clampPageSize(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.min(500, Math.floor(raw)));
}

export function MongoShellResultTree({ documents }: MongoShellResultTreeProps): ReactElement {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [limitDraft, setLimitDraft] = useState(String(DEFAULT_PAGE_SIZE));
  const [userSetPageSize, setUserSetPageSize] = useState(false);
  const [widths, setWidths] = useState(DEFAULT_WIDTHS);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ col: ColKey; startX: number; startW: number } | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height ?? el.clientHeight;
      if (userSetPageSize) return;
      const fit = pageSizeFromViewport(height);
      setPageSize(fit);
      setLimitDraft(String(fit));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [userSetPageSize, documents.length]);

  useEffect(() => {
    setPage(0);
  }, [documents, pageSize]);

  const total = documents.length;
  const size = clampPageSize(pageSize);
  const pageCount = Math.max(1, Math.ceil(total / size) || 1);
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * size;
  const slice = documents.slice(start, start + size);
  const from = total === 0 ? 0 : start + 1;
  const to = Math.min(start + size, total);

  const commitLimit = () => {
    const next = clampPageSize(Number(limitDraft));
    setLimitDraft(String(next));
    setPageSize(next);
    setUserSetPageSize(true);
  };

  const onResizeMouseDown = (col: ColKey, event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { col, startX: event.clientX, startW: widths[col] };

    const onMove = (ev: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = Math.max(MIN_COL, drag.startW + (ev.clientX - drag.startX));
      setWidths((prev) => ({ ...prev, [drag.col]: next }));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const go = useCallback(
    (next: number) => {
      setPage(Math.max(0, Math.min(pageCount - 1, next)));
    },
    [pageCount],
  );

  if (documents.length === 0) {
    return <p className="mongo-shell__hint">No documents.</p>;
  }

  return (
    <div className="mongo-shell-tree">
      <div className="mongo-shell-tree__toolbar">
        <div className="mongo-shell-tree__pager">
          <button
            type="button"
            className="mongo-shell-tree__nav"
            aria-label="First page"
            disabled={safePage <= 0}
            onClick={() => go(0)}
          >
            «
          </button>
          <button
            type="button"
            className="mongo-shell-tree__nav"
            aria-label="Previous page"
            disabled={safePage <= 0}
            onClick={() => go(safePage - 1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="mongo-shell-tree__nav"
            aria-label="Next page"
            disabled={safePage >= pageCount - 1}
            onClick={() => go(safePage + 1)}
          >
            ›
          </button>
          <button
            type="button"
            className="mongo-shell-tree__nav"
            aria-label="Last page"
            disabled={safePage >= pageCount - 1}
            onClick={() => go(pageCount - 1)}
          >
            »
          </button>
          <label className="mongo-shell-tree__limit">
            <input
              type="number"
              min={1}
              max={500}
              value={limitDraft}
              onChange={(e) => setLimitDraft(e.target.value)}
              onBlur={commitLimit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitLimit();
                }
              }}
              aria-label="Documents per page"
              title="Documents per page (auto-fits pane until you edit)"
            />
          </label>
          <span className="mongo-shell-tree__meta">
            Documents {from}–{to} of {total}
          </span>
        </div>
      </div>
      <div className="mongo-shell-tree__scroll" ref={scrollRef}>
        <table className="mongo-shell-tree__table">
          <colgroup>
            <col style={{ width: widths.key }} />
            <col style={{ width: widths.value }} />
            <col style={{ width: widths.type }} />
          </colgroup>
          <thead>
            <tr>
              <th>
                Key
                <span
                  className="mongo-shell-tree__col-resize"
                  onMouseDown={(e) => onResizeMouseDown('key', e)}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize Key column"
                />
              </th>
              <th>
                Value
                <span
                  className="mongo-shell-tree__col-resize"
                  onMouseDown={(e) => onResizeMouseDown('value', e)}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize Value column"
                />
              </th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((doc, index) => {
              const abs = start + index;
              const root = buildResultTree(doc, `{${abs}}`, `d${abs}`);
              return <TreeRows key={root.id} node={root} depth={0} />;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
