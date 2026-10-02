import { describe, expect, it } from 'vitest';
import {
  DATASET_SLIDER_CENTER_GB,
  DATASET_SLIDER_MAX_GB,
  DATASET_SLIDER_MIN_GB,
  datasetScaleSliderTrackPercent,
  rawDataGbFromSliderPosition,
  sliderPositionFromRawDataGb,
} from './datasetScaleSlider';

describe('datasetScaleSlider piecewise mapping', () => {
  it('places 4 TB at the center of the track', () => {
    const centerPos = sliderPositionFromRawDataGb(DATASET_SLIDER_CENTER_GB);
    expect(centerPos).toBe(500);
    expect(datasetScaleSliderTrackPercent(DATASET_SLIDER_CENTER_GB)).toBeCloseTo(50, 0);
    expect(rawDataGbFromSliderPosition(500)).toBeCloseTo(DATASET_SLIDER_CENTER_GB, 0);
  });

  it('maps min and max to track ends', () => {
    expect(sliderPositionFromRawDataGb(DATASET_SLIDER_MIN_GB)).toBe(0);
    expect(sliderPositionFromRawDataGb(DATASET_SLIDER_MAX_GB)).toBe(1000);
    expect(rawDataGbFromSliderPosition(0)).toBeCloseTo(DATASET_SLIDER_MIN_GB, 2);
    expect(rawDataGbFromSliderPosition(1000)).toBeCloseTo(DATASET_SLIDER_MAX_GB, 0);
  });

  it('spreads sub-4TB tiers across the left half', () => {
    const m60AnchorGb = 900;
    const percent = datasetScaleSliderTrackPercent(m60AnchorGb);
    expect(percent).toBeGreaterThan(8);
    expect(percent).toBeLessThan(50);
  });

  it('round-trips slider position and GB within one step', () => {
    for (const gb of [1, 128, 4096, 7168, 20_000]) {
      const clamped = Math.min(DATASET_SLIDER_MAX_GB, Math.max(1, gb));
      const pos = sliderPositionFromRawDataGb(clamped);
      const back = rawDataGbFromSliderPosition(pos);
      const stepGb = (DATASET_SLIDER_CENTER_GB - DATASET_SLIDER_MIN_GB) / 500;
      expect(Math.abs(back - clamped)).toBeLessThanOrEqual(stepGb + 1);
    }
  });
});
