import { describe, expect, it } from 'vitest';
import {
  ATLAS_CONNECTIVITY_ARCHITECT_FRAMEWORK,
  ATLAS_CONNECTIVITY_ARCHITECT_SYSTEM_PROMPT,
  buildAtlasConnectivityArchitectSystemPrompt,
} from './atlasConnectivityArchitectPrompt.js';

describe('atlasConnectivityArchitectPrompt', () => {
  it('defines principal architect role and five design areas', () => {
    expect(ATLAS_CONNECTIVITY_ARCHITECT_FRAMEWORK).toContain(
      'Principal Cloud Network & Security Architect',
    );
    expect(ATLAS_CONNECTIVITY_ARCHITECT_FRAMEWORK).toContain('AWS PrivateLink');
    expect(ATLAS_CONNECTIVITY_ARCHITECT_FRAMEWORK).toContain('Azure Private Link');
    expect(ATLAS_CONNECTIVITY_ARCHITECT_FRAMEWORK).toContain('GCP Private Service Connect');
    expect(ATLAS_CONNECTIVITY_ARCHITECT_FRAMEWORK).toContain('IAM & RBAC');
    expect(ATLAS_CONNECTIVITY_ARCHITECT_FRAMEWORK).toContain('mongodbatlas_privatelink_endpoint');
  });

  it('includes validation and application input checklist', () => {
    expect(ATLAS_CONNECTIVITY_ARCHITECT_FRAMEWORK).toContain('dig');
    expect(ATLAS_CONNECTIVITY_ARCHITECT_FRAMEWORK).toContain('mongosh');
    expect(ATLAS_CONNECTIVITY_ARCHITECT_FRAMEWORK).toContain('Target Cloud Provider');
    expect(ATLAS_CONNECTIVITY_ARCHITECT_FRAMEWORK).toContain('Authentication Strategy');
  });

  it('composes instructions with framework for system prompt', () => {
    const prompt = buildAtlasConnectivityArchitectSystemPrompt();
    expect(prompt).toContain('private connectivity');
    expect(prompt).toContain(ATLAS_CONNECTIVITY_ARCHITECT_FRAMEWORK);
    expect(ATLAS_CONNECTIVITY_ARCHITECT_SYSTEM_PROMPT).toBe(prompt);
  });
});
