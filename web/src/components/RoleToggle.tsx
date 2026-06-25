import type { UiRole } from '../sessionState';

type RoleToggleProps = {
  role: UiRole;
  onChange: (role: UiRole) => void;
};

export function RoleToggle({ role, onChange }: RoleToggleProps) {
  return (
    <div className="role-toggle" role="group" aria-label="Interface role">
      <button
        type="button"
        className={role === 'developer' ? 'role-toggle__btn active' : 'role-toggle__btn'}
        onClick={() => onChange('developer')}
        aria-pressed={role === 'developer'}
      >
        Developer
      </button>
      <button
        type="button"
        className={role === 'manager' ? 'role-toggle__btn active' : 'role-toggle__btn'}
        onClick={() => onChange('manager')}
        aria-pressed={role === 'manager'}
      >
        Manager
      </button>
    </div>
  );
}
