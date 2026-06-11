/**
 * Non-overlapping range splitting.
 *
 * To extract a table with many workers at once WITHOUT two workers ever
 * touching the same row, we slice the table's numeric primary key (or its
 * timestamp, for bucketed collections) into contiguous half-open ranges
 * [start, end). Each worker gets one range, so the union of all chunks is
 * exactly the table and the intersection of any two chunks is empty.
 */

/** One half-open extraction range: rows where start <= key < end. */
export type ChunkRange = {
  start: number;
  end: number;
};

/**
 * Split [min, max] into `chunkCount` contiguous half-open ranges.
 *
 * The final range's end is max + 1 so the row holding the maximum key is
 * included (ranges are half-open).
 *
 * @param min - Smallest key value present in the table.
 * @param max - Largest key value present in the table.
 * @param chunkCount - How many ranges to produce (workers to feed).
 */
export function splitRange(min: number, max: number, chunkCount: number): ChunkRange[] {
  if (chunkCount <= 0) return [];
  const exclusiveEnd = max + 1;
  const span = exclusiveEnd - min;
  if (span <= 0) return [{ start: min, end: exclusiveEnd }];

  const effectiveChunks = Math.min(chunkCount, span);
  const chunkSize = Math.ceil(span / effectiveChunks);

  const ranges: ChunkRange[] = [];
  for (let start = min; start < exclusiveEnd; start += chunkSize) {
    ranges.push({ start, end: Math.min(start + chunkSize, exclusiveEnd) });
  }
  return ranges;
}

/**
 * Split a time span into ranges whose boundaries land exactly on bucket
 * window edges. This guarantee matters for the Bucket pattern: when chunk
 * boundaries align to whole windows, every (source, window) bucket falls
 * entirely inside one chunk, so no two parallel workers can produce partial
 * versions of the same bucket document.
 *
 * @param minEpochSeconds - Earliest timestamp in the table (unix seconds).
 * @param maxEpochSeconds - Latest timestamp in the table (unix seconds).
 * @param chunkCount - How many ranges to aim for.
 * @param windowMinutes - The bucket window size the ranges must align to.
 */
export function splitTimeRangeAligned(
  minEpochSeconds: number,
  maxEpochSeconds: number,
  chunkCount: number,
  windowMinutes: number,
): ChunkRange[] {
  const windowSeconds = windowMinutes * 60;
  // Snap the start down and the end up to whole window boundaries.
  const alignedStart = Math.floor(minEpochSeconds / windowSeconds) * windowSeconds;
  const alignedEnd = (Math.floor(maxEpochSeconds / windowSeconds) + 1) * windowSeconds;

  const totalWindows = (alignedEnd - alignedStart) / windowSeconds;
  const effectiveChunks = Math.max(1, Math.min(chunkCount, totalWindows));
  const windowsPerChunk = Math.ceil(totalWindows / effectiveChunks);

  const ranges: ChunkRange[] = [];
  for (let start = alignedStart; start < alignedEnd; start += windowsPerChunk * windowSeconds) {
    ranges.push({ start, end: Math.min(start + windowsPerChunk * windowSeconds, alignedEnd) });
  }
  return ranges;
}
