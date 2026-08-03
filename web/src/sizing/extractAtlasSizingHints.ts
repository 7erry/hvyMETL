import type { SizingAtlasHints } from './buildSizingAssistantStudioSeed';
import { readMongoInspectCollectionRows, readMongoInspectIndexRows } from '../copilot/mongoInspectFormat';

function avgDocKbFromCollectionRow(row: {
  documentCount?: number;
  storageSize?: number;
  storageSizeUnits?: string;
}): number | undefined {
  const docs = row.documentCount;
  const size = row.storageSize;
  if (docs === undefined || size === undefined || docs <= 0 || size <= 0) return undefined;
  const units = (row.storageSizeUnits ?? 'bytes').toLowerCase();
  let bytes = size;
  if (units === 'kb' || units === 'kilobytes') bytes = size * 1024;
  else if (units === 'mb' || units === 'megabytes') bytes = size * 1024 ** 2;
  else if (units === 'gb' || units === 'gigabytes') bytes = size * 1024 ** 3;
  return bytes / docs / 1024;
}

/** Extract sizing hints from a successful Mongo inspect tool payload. */
export function extractAtlasSizingHintsFromInspect(
  tool: string,
  data: unknown,
): Partial<SizingAtlasHints> | null {
  if (tool === 'listMongoCollections') {
    const { collections } = readMongoInspectCollectionRows(data);
    let weightedSum = 0;
    let docTotal = 0;
    let indexSum = 0;
    let indexCollections = 0;
    for (const row of collections) {
      const kb = avgDocKbFromCollectionRow(row);
      const docs = row.documentCount ?? 0;
      if (kb !== undefined && docs > 0) {
        weightedSum += kb * docs;
        docTotal += docs;
      }
      if (typeof row.indexCount === 'number' && row.indexCount > 0) {
        indexSum += row.indexCount;
        indexCollections += 1;
      }
    }
    const hints: Partial<SizingAtlasHints> = {};
    if (docTotal > 0) {
      hints.avgDocSizeKb = Math.round((weightedSum / docTotal) * 100) / 100;
    }
    if (indexCollections > 0) {
      hints.secondaryIndexCount = Math.max(1, Math.round(indexSum / indexCollections));
    }
    return Object.keys(hints).length > 0 ? hints : null;
  }

  if (tool === 'listMongoCollectionIndexes') {
    const summary = readMongoInspectIndexRows(data);
    const classic = summary.classicIndexes.length;
    if (classic <= 0) return null;
    return { secondaryIndexCount: classic };
  }

  return null;
}

export function mergeSizingAtlasHints(
  previous: SizingAtlasHints | undefined,
  patch: Partial<SizingAtlasHints>,
): SizingAtlasHints {
  return {
    avgDocSizeKb: patch.avgDocSizeKb ?? previous?.avgDocSizeKb,
    secondaryIndexCount: patch.secondaryIndexCount ?? previous?.secondaryIndexCount,
  };
}
