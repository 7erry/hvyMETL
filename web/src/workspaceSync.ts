import type { SessionState } from './sessionState';

export type TenantWorkspace = {
  version?: number;
  updatedAt?: string;
  profileId?: string;
  dialect?: string;
  ddl?: string;
  model?: SessionState['model'];
  csvSourcePath?: string | null;
  managerCostInputs?: SessionState['managerCostInputs'];
  customProfile?: SessionState['customProfile'];
  customTelemetryInput?: SessionState['customTelemetryInput'];
  cardinalityOverrides?: SessionState['cardinalityOverrides'];
  forceEmbedOverrides?: SessionState['forceEmbedOverrides'];
  uiRole?: SessionState['uiRole'];
};

export function sessionToWorkspace(state: SessionState): TenantWorkspace {
  return {
    profileId: state.profileId,
    dialect: state.dialect,
    ddl: state.ddl,
    model: state.model,
    csvSourcePath: state.csvSourcePath,
    managerCostInputs: state.managerCostInputs,
    customProfile: state.customProfile,
    customTelemetryInput: state.customTelemetryInput,
    cardinalityOverrides: state.cardinalityOverrides,
    forceEmbedOverrides: state.forceEmbedOverrides,
    uiRole: state.uiRole,
  };
}

export function mergeWorkspaceIntoSession(state: SessionState, workspace: TenantWorkspace): SessionState {
  return {
    ...state,
    ...(workspace.profileId !== undefined ? { profileId: workspace.profileId } : {}),
    ...(workspace.dialect !== undefined ? { dialect: workspace.dialect } : {}),
    ...(workspace.ddl !== undefined ? { ddl: workspace.ddl } : {}),
    ...(workspace.model !== undefined ? { model: workspace.model } : {}),
    ...(workspace.csvSourcePath !== undefined ? { csvSourcePath: workspace.csvSourcePath } : {}),
    ...(workspace.managerCostInputs !== undefined
      ? { managerCostInputs: { ...state.managerCostInputs, ...workspace.managerCostInputs } }
      : {}),
    ...(workspace.customProfile !== undefined ? { customProfile: workspace.customProfile } : {}),
    ...(workspace.customTelemetryInput !== undefined
      ? { customTelemetryInput: workspace.customTelemetryInput }
      : {}),
    ...(workspace.cardinalityOverrides !== undefined
      ? { cardinalityOverrides: workspace.cardinalityOverrides }
      : {}),
    ...(workspace.forceEmbedOverrides !== undefined
      ? { forceEmbedOverrides: workspace.forceEmbedOverrides }
      : {}),
    ...(workspace.uiRole !== undefined ? { uiRole: workspace.uiRole } : {}),
  };
}
