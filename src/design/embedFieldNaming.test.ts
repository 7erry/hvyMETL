import { describe, expect, it } from 'vitest';
import {
  computedTotalFieldName,
  fullEmbedFieldName,
  subsetEmbedFieldName,
} from './embedFieldNaming.js';

describe('embedFieldNaming', () => {
  it('uses loyalty and recentAddresses on customers', () => {
    expect(fullEmbedFieldName('customers', 'customer_loyalty')).toBe('loyalty');
    expect(subsetEmbedFieldName('customers', 'customer_addresses')).toBe('recentAddresses');
    expect(computedTotalFieldName('customers', 'customer_addresses')).toBe('totalAddresses');
  });
});
