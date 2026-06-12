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

const base = '';

export async function buildCustomProfile(input: CustomProfileInput): Promise<WorkloadProfile> {
  const res = await fetch(`${base}/api/profiles/custom`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data.profile;
}

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
