import { afterEach, describe, expect, it } from 'vitest';
import { isProductionUiContext } from './setupWebUi.js';

describe('isProductionUiContext', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('is true when NODE_ENV is production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.HVYMETL_HOSTED;
    delete process.env.HVYMETL_HOSTED_URL;
    expect(isProductionUiContext()).toBe(true);
  });

  it('is true when HVYMETL_HOSTED is set', () => {
    process.env.NODE_ENV = 'development';
    process.env.HVYMETL_HOSTED = '1';
    expect(isProductionUiContext()).toBe(true);
  });

  it('is false for local dev without hosted flags', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.HVYMETL_HOSTED;
    delete process.env.HVYMETL_HOSTED_URL;
    expect(isProductionUiContext()).toBe(false);
  });
});
