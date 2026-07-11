import { describe, expect, it } from 'vitest';
import { defaultSessionState } from './sessionState';
import { mergeWorkspaceIntoSession, sessionToWorkspace } from './workspaceSync';

describe('workspaceSync', () => {
  it('round-trips session settings into a tenant workspace document', () => {
    const state = defaultSessionState();
    state.profileId = 'catalog';
    state.dialect = 'postgresql';
    state.managerCostInputs.workloadType = 'analytics';

    const workspace = sessionToWorkspace(state);
    const merged = mergeWorkspaceIntoSession(defaultSessionState(), workspace);

    expect(merged.profileId).toBe('catalog');
    expect(merged.dialect).toBe('postgresql');
    expect(merged.managerCostInputs.workloadType).toBe('analytics');
  });
});
