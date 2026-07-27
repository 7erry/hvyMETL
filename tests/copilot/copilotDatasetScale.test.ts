import { describe, expect, it } from 'vitest';
import {
  buildCopilotDatasetScaleResponse,
  formatCopilotDataGb,
  formatDatasetScaleSection,
  isCopilotDatasetScaleQuestion,
} from '../../src/copilot/copilotDatasetScale.js';

describe('copilotDatasetScale', () => {
  it('detects dataset scale questions', () => {
    expect(isCopilotDatasetScaleQuestion('what is the current Dataset scale — raw data size?')).toBe(true);
    expect(isCopilotDatasetScaleQuestion('What is the raw data size?')).toBe(true);
    expect(isCopilotDatasetScaleQuestion('list databases')).toBe(false);
  });

  it('formats manager override for the system prompt', () => {
    const section = formatDatasetScaleSection({
      rawDataSource: 'manager-override',
      managerRawDataGb: 3 * 1024,
      rawDataGb: 3 * 1024,
      totalStorageGb: 4 * 1024,
      activeStorageGb: 3.5 * 1024,
      archiveStorageGb: 512,
      estimatedTotalRows: 50_000_000,
      averageDocumentBytes: 640,
      workloadLabel: 'Write-heavy',
      growthRatePercent: 15,
      recommendedTierLabel: 'M50',
      requiresSharding: true,
      shardingRecommendations: [
        {
          collectionName: 'events',
          strategy: 'hashed',
          shardKeySummary: 'recordedAt: hashed',
          estimatedHotStorageGb: 1800,
          rationale: 'Spread append-heavy ingest.',
        },
      ],
    });

    expect(section).toContain('3 TB');
    expect(section).toContain('Manager slider override');
    expect(section).toContain('events');
    expect(section).toContain('Sharding: recommended');
  });

  it('answers dataset scale questions using manager override', () => {
    const response = buildCopilotDatasetScaleResponse({
      rawDataSource: 'manager-override',
      managerRawDataGb: 512,
      rawDataGb: 512,
      totalStorageGb: 700,
      activeStorageGb: 650,
      archiveStorageGb: 50,
      estimatedTotalRows: 1_000_000,
      averageDocumentBytes: 512,
      workloadLabel: 'Balanced',
      growthRatePercent: 10,
      recommendedTierLabel: 'M40',
      requiresSharding: false,
      shardingRecommendations: [],
    });

    expect(response).toContain('512 GB');
    expect(response).toContain('Manager **Dataset scale — raw data** slider');
    expect(formatCopilotDataGb(2048)).toBe('2 TB');
  });

  it('explains how to set scale when unavailable', () => {
    const response = buildCopilotDatasetScaleResponse({
      rawDataSource: 'unavailable',
      managerRawDataGb: null,
      rawDataGb: null,
      totalStorageGb: null,
      activeStorageGb: null,
      archiveStorageGb: null,
      estimatedTotalRows: null,
      averageDocumentBytes: null,
      workloadLabel: null,
      growthRatePercent: null,
      recommendedTierLabel: null,
      requiresSharding: false,
      shardingRecommendations: [],
    });

    expect(response).toContain('Dataset scale — raw data');
  });
});
