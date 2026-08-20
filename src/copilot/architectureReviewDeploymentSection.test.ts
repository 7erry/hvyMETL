import { describe, expect, it } from 'vitest';
import { ARCHITECTURE_REVIEW_DEPLOYMENT_SECTION } from './architectureReviewDeploymentSection.js';

describe('architectureReviewDeploymentSection', () => {
  it('requires Well-Architected deployment options and gold-standard table', () => {
    expect(ARCHITECTURE_REVIEW_DEPLOYMENT_SECTION).toContain('§9 Atlas deployment options');
    expect(ARCHITECTURE_REVIEW_DEPLOYMENT_SECTION).toContain('Well-Architected Framework');
    expect(ARCHITECTURE_REVIEW_DEPLOYMENT_SECTION).toContain('Multi-region replica sets');
    expect(ARCHITECTURE_REVIEW_DEPLOYMENT_SECTION).toContain('PrivateLink');
    expect(ARCHITECTURE_REVIEW_DEPLOYMENT_SECTION).toContain('TLS 1.3');
    expect(ARCHITECTURE_REVIEW_DEPLOYMENT_SECTION).toContain('CSFLE');
    expect(ARCHITECTURE_REVIEW_DEPLOYMENT_SECTION).toContain('Continuous Cloud Backups');
    expect(ARCHITECTURE_REVIEW_DEPLOYMENT_SECTION).toContain('Datadog');
  });
});
