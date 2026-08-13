/** Shared profile types and API helpers for the web UI. */

export type ReadPreferenceSetting =
  | 'primary'
  | 'primaryPreferred'
  | 'secondary'
  | 'secondaryPreferred'
  | 'nearest';

export type CompressionSetting = 'snappy' | 'zstd' | 'zlib' | 'none';

export type CustomProfileInput = {
  readPercent: number;
  writePercent: number;
  peakRpm: number;
  growthRate: string;
  readPreference: ReadPreferenceSetting;
  writeConcernW: number | 'majority';
  writeConcernJournal: boolean;
  compression: CompressionSetting;
};

export type WorkloadProfile = {
  id: string;
  label: string;
  description: string;
  telemetry: {
    readPercent: number;
    writePercent: number;
    peakRpm: number;
    growthRate: string;
  };
  writeConcern: { w: number | 'majority'; journal: boolean };
  readPreference: ReadPreferenceSetting;
  compression: CompressionSetting;
  pool: {
    maxPoolSize: number;
    minPoolSize: number;
    socketTimeoutMS: number;
    maxIdleTimeMS: number;
  };
};

export type ProfileRequestFields = {
  profileId: string;
  customProfile?: WorkloadProfile;
};

export function profileRequestBody(profileId: string, customProfile: WorkloadProfile | null): ProfileRequestFields {
  if (profileId === 'custom' && customProfile) {
    return { profileId: 'custom', customProfile };
  }
  return { profileId };
}

type ProfileTelemetrySource = Pick<
  WorkloadProfile,
  'id' | 'telemetry' | 'readPreference' | 'writeConcern' | 'compression'
>;

/** Map a workload profile into the custom telemetry modal form shape. */
export function workloadProfileToCustomInput(
  profile: Pick<WorkloadProfile, 'telemetry' | 'readPreference' | 'writeConcern' | 'compression'>,
): CustomProfileInput {
  return {
    readPercent: profile.telemetry.readPercent,
    writePercent: profile.telemetry.writePercent,
    peakRpm: profile.telemetry.peakRpm,
    growthRate: profile.telemetry.growthRate,
    readPreference: profile.readPreference,
    writeConcernW: profile.writeConcern.w,
    writeConcernJournal: profile.writeConcern.journal,
    compression: profile.compression,
  };
}

/** Seed the custom workload modal from the active session profile. */
export function resolveCustomTelemetryInitial(args: {
  profileId: string;
  customProfile: WorkloadProfile | null;
  customTelemetryInput: CustomProfileInput | null;
  presets: ProfileTelemetrySource[];
}): CustomProfileInput {
  if (args.profileId === 'custom') {
    if (args.customTelemetryInput) return args.customTelemetryInput;
    if (args.customProfile) return workloadProfileToCustomInput(args.customProfile);
  }

  const preset = args.presets.find((p) => p.id === args.profileId);
  if (preset) return workloadProfileToCustomInput(preset);

  const fallback = args.presets.find((p) => p.id === 'catalog') ?? args.presets[0];
  if (fallback) return workloadProfileToCustomInput(fallback);

  return workloadProfileToCustomInput({
    telemetry: { readPercent: 95, writePercent: 5, peakRpm: 60_000, growthRate: '5GB/month' },
    readPreference: 'primaryPreferred',
    writeConcern: { w: 1, journal: false },
    compression: 'snappy',
  });
}
