/**
 * User-supplied custom workload settings (web UI and API).
 */
export type CustomProfileInput = {
  readPercent: number;
  writePercent: number;
  peakRpm: number;
  growthRate: string;
  readPreference: import('../types.js').ReadPreferenceSetting;
  writeConcernW: number | 'majority';
  writeConcernJournal: boolean;
  compression: import('../types.js').CompressionSetting;
};

/** Validate and normalize custom profile input from the UI or API. */
export function validateCustomProfileInput(input: CustomProfileInput): CustomProfileInput {
  const readPercent = Number(input.readPercent);
  const writePercent = Number(input.writePercent);
  const peakRpm = Number(input.peakRpm);
  const growthRate = String(input.growthRate ?? '').trim();

  if (!Number.isFinite(readPercent) || !Number.isFinite(writePercent) || readPercent + writePercent !== 100) {
    throw new Error('readPercent and writePercent must be numbers that sum to 100.');
  }
  if (!Number.isFinite(peakRpm) || peakRpm <= 0) {
    throw new Error('peakRpm must be a positive number.');
  }
  if (!growthRate) {
    throw new Error('growthRate is required.');
  }

  const readPreference = input.readPreference;
  const allowedReadPrefs = ['primary', 'primaryPreferred', 'secondary', 'secondaryPreferred', 'nearest'] as const;
  if (!allowedReadPrefs.includes(readPreference)) {
    throw new Error(`Invalid readPreference "${readPreference}".`);
  }

  const compression = input.compression;
  const allowedCompression = ['snappy', 'zstd', 'zlib', 'none'] as const;
  if (!allowedCompression.includes(compression)) {
    throw new Error(`Invalid compression "${compression}".`);
  }

  const writeConcernW = input.writeConcernW;
  if (writeConcernW !== 'majority' && (!Number.isFinite(Number(writeConcernW)) || Number(writeConcernW) < 1)) {
    throw new Error('writeConcernW must be "majority" or a positive integer.');
  }

  return {
    readPercent,
    writePercent,
    peakRpm,
    growthRate,
    readPreference,
    writeConcernW: writeConcernW === 'majority' ? 'majority' : Number(writeConcernW),
    writeConcernJournal: Boolean(input.writeConcernJournal),
    compression,
  };
}
