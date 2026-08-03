import { useMemo, type ReactNode } from 'react';
import type { MigrationPlan } from '../migrationPlanTypes';
import type { SqlStructuralModel } from '../types';
import type { ManagerCostInputs } from '../managerCostEstimate';
import type { WorkloadProfile } from '../customProfileShared';
import type { SizingAtlasHints } from './extractAtlasSizingHints';
import {
  buildSizingAssistantStudioSeed,
  type WorkloadTelemetrySeed,
} from './buildSizingAssistantStudioSeed';
import { SizingAssistantProvider } from './SizingAssistantContext';
import { useCopilot } from '../copilot/CopilotContext';

type ProfileListEntry = {
  id: string;
  telemetry: { peakRpm: number; readPercent: number; writePercent: number };
  compression: string;
};

export type SizingAssistantStudioBridgeProps = {
  children: ReactNode;
  model: SqlStructuralModel | null;
  plan: MigrationPlan | null;
  managerCostInputs: ManagerCostInputs;
  profileId: string;
  customProfile: WorkloadProfile | null;
  profiles: ProfileListEntry[];
  sizingAtlasHints?: SizingAtlasHints;
};

function resolveTelemetry(input: {
  profileId: string;
  customProfile: WorkloadProfile | null;
  profiles: ProfileListEntry[];
}): WorkloadTelemetrySeed | null {
  if (input.profileId === 'custom' && input.customProfile) {
    return {
      peakRpm: input.customProfile.telemetry.peakRpm,
      readPercent: input.customProfile.telemetry.readPercent,
      writePercent: input.customProfile.telemetry.writePercent,
      compression: input.customProfile.compression,
    };
  }
  const profile = input.profiles.find((entry) => entry.id === input.profileId);
  if (!profile) return null;
  return {
    peakRpm: profile.telemetry.peakRpm,
    readPercent: profile.telemetry.readPercent,
    writePercent: profile.telemetry.writePercent,
    compression: profile.compression,
  };
}

/** Connects Manager, workload profile, and Copilot Atlas context to the sizing assistant session. */
export function SizingAssistantStudioBridge({
  children,
  model,
  plan,
  managerCostInputs,
  profileId,
  customProfile,
  profiles,
  sizingAtlasHints,
}: SizingAssistantStudioBridgeProps) {
  const copilot = useCopilot();
  const telemetry = useMemo(
    () => resolveTelemetry({ profileId, customProfile, profiles }),
    [profileId, customProfile, profiles],
  );

  const studioSeed = useMemo(
    () =>
      buildSizingAssistantStudioSeed({
        model,
        plan,
        managerCostInputs,
        telemetry,
        targetDatabase: copilot.targetDatabase,
        atlasHints: sizingAtlasHints,
      }),
    [model, plan, managerCostInputs, telemetry, copilot.targetDatabase, sizingAtlasHints],
  );

  return <SizingAssistantProvider studioSeed={studioSeed}>{children}</SizingAssistantProvider>;
}
