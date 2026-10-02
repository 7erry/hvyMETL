/** Minimum raw dataset size on the sizing slider (GB). */
export const DATASET_SLIDER_MIN_GB = 1;

/** Maximum raw dataset size on the sizing slider (GB) — 50 TB. */
export const DATASET_SLIDER_MAX_GB = 50 * 1024;

/** Pivot: 4 TB sits at the horizontal center of the slider track. */
export const DATASET_SLIDER_CENTER_GB = 4 * 1024;

/** Internal range input steps (0 … STEPS) for smooth piecewise mapping. */
export const DATASET_SLIDER_POSITION_STEPS = 1000;

function clampGb(gb: number): number {
  return Math.max(DATASET_SLIDER_MIN_GB, Math.min(DATASET_SLIDER_MAX_GB, gb));
}

/**
 * Map slider position (0–1000) to raw GB: slower below 4 TB, faster above.
 * Position 500 ≈ 4 TB.
 */
export function rawDataGbFromSliderPosition(position: number): number {
  const steps = DATASET_SLIDER_POSITION_STEPS;
  const t = Math.max(0, Math.min(1, position / steps));
  const min = DATASET_SLIDER_MIN_GB;
  const center = DATASET_SLIDER_CENTER_GB;
  const max = DATASET_SLIDER_MAX_GB;

  if (t <= 0.5) {
    return min + (center - min) * (t / 0.5);
  }
  return center + (max - center) * ((t - 0.5) / 0.5);
}

/** Inverse mapping: raw GB → slider position (0–1000). */
export function sliderPositionFromRawDataGb(rawDataGb: number): number {
  const gb = clampGb(rawDataGb);
  const min = DATASET_SLIDER_MIN_GB;
  const center = DATASET_SLIDER_CENTER_GB;
  const max = DATASET_SLIDER_MAX_GB;
  const steps = DATASET_SLIDER_POSITION_STEPS;

  let t: number;
  if (gb <= center) {
    t = 0.5 * ((gb - min) / (center - min));
  } else {
    t = 0.5 + 0.5 * ((gb - center) / (max - center));
  }
  return Math.round(Math.max(0, Math.min(steps, t * steps)));
}

/** Percent along the track (0–100) for tier ruler marks and center tick. */
export function datasetScaleSliderTrackPercent(rawDataGb: number): number {
  return (sliderPositionFromRawDataGb(rawDataGb) / DATASET_SLIDER_POSITION_STEPS) * 100;
}
