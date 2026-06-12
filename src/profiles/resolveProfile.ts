import type { WorkloadProfile } from '../types.js';
import { buildCustomProfileFromInput, getProfile } from '../profiles/profiles.js';
import type { CustomProfileInput } from '../profiles/customProfileInput.js';

/** Resolve a workload profile from API/CLI request fields. */
export function resolveWorkloadProfile(body: {
  profileId?: string;
  customProfile?: WorkloadProfile;
  customTelemetry?: CustomProfileInput;
}): WorkloadProfile {
  if (body.customProfile?.id === 'custom') {
    return body.customProfile;
  }
  if (body.customTelemetry) {
    return buildCustomProfileFromInput(body.customTelemetry);
  }
  const profileId = String(body.profileId ?? 'catalog');
  if (profileId === 'custom') {
    throw new Error('custom profileId requires customProfile or customTelemetry in the request body.');
  }
  return getProfile(profileId);
}
