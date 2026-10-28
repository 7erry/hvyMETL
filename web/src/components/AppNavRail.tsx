import type { ReactElement, ReactNode } from 'react';

export type AppNavId =
  | 'schema'
  | 'database'
  | 'sizing'
  | 'shell'
  | 'copilot'
  | 'roles'
  | 'settings';

type AppNavRailProps = {
  active: AppNavId;
  onSelect: (id: AppNavId) => void;
  copilotAvailable?: boolean;
  shellAvailable?: boolean;
  rolesAvailable?: boolean;
};

type NavItem = {
  id: AppNavId;
  label: string;
  icon: ReactNode;
};

function IconSchema(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 7h3M10.5 16h3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconDatabase(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <ellipse cx="12" cy="6" rx="6.5" ry="2.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 6v12c0 1.25 2.9 2.25 6.5 2.25s6.5-1 6.5-2.25V6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 12c0 1.25 2.9 2.25 6.5 2.25s6.5-1 6.5-2.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconSizing(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="4" y="12" width="3.5" height="7" rx="0.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10.25" y="8" width="3.5" height="11" rx="0.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="16.5" y="4.5" width="3.5" height="14.5" rx="0.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconShell(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7.5 9.5l3 2.5-3 2.5M12.5 14.5H16.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCopilot(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M5 6.75h14a1.75 1.75 0 0 1 1.75 1.75v6.5A1.75 1.75 0 0 1 19 16.75h-8.2L7 20v-3.25H5A1.75 1.75 0 0 1 3.25 15V8.5A1.75 1.75 0 0 1 5 6.75z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8 12.25v.5M12 10.5v4M16 12.25v.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconRoles(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5.75 19c.7-2.9 2.95-4.5 6.25-4.5s5.55 1.6 6.25 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSettings(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="2.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 4v2.1M12 17.9V20M5.6 6.4l1.5 1.5M16.9 16.1l1.5 1.5M4 12h2.1M17.9 12H20M5.6 17.6l1.5-1.5M16.9 7.9l1.5-1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

const PRIMARY_ITEMS: NavItem[] = [
  { id: 'schema', label: 'Schema', icon: <IconSchema /> },
  { id: 'database', label: 'Database', icon: <IconDatabase /> },
  { id: 'sizing', label: 'Sizing', icon: <IconSizing /> },
  { id: 'shell', label: 'Shell', icon: <IconShell /> },
  { id: 'copilot', label: 'Copilot', icon: <IconCopilot /> },
  { id: 'roles', label: 'Roles', icon: <IconRoles /> },
];

const SETTINGS_ITEM: NavItem = {
  id: 'settings',
  label: 'Settings',
  icon: <IconSettings />,
};

function NavButton({
  item,
  active,
  disabled,
  onSelect,
}: {
  item: NavItem;
  active: boolean;
  disabled?: boolean;
  onSelect: (id: AppNavId) => void;
}): ReactElement {
  return (
    <button
      type="button"
      className={active ? 'app-nav-rail__item active' : 'app-nav-rail__item'}
      aria-current={active ? 'page' : undefined}
      aria-label={item.label}
      disabled={disabled}
      onClick={() => onSelect(item.id)}
    >
      <span className="app-nav-rail__icon">{item.icon}</span>
      <span className="app-nav-rail__label">{item.label}</span>
    </button>
  );
}

export function AppNavRail({
  active,
  onSelect,
  copilotAvailable = true,
  shellAvailable = true,
  rolesAvailable = true,
}: AppNavRailProps): ReactElement {
  return (
    <nav className="app-nav-rail" aria-label="Primary">
      <div className="app-nav-rail__group">
        {PRIMARY_ITEMS.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={active === item.id}
            disabled={
              (item.id === 'copilot' && !copilotAvailable) ||
              (item.id === 'shell' && !shellAvailable) ||
              (item.id === 'roles' && !rolesAvailable)
            }
            onSelect={onSelect}
          />
        ))}
      </div>
      <div className="app-nav-rail__footer">
        <NavButton item={SETTINGS_ITEM} active={active === 'settings'} onSelect={onSelect} />
      </div>
    </nav>
  );
}
