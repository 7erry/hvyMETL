import { describe, expect, it } from 'vitest';
import { formatRelationshipLabel } from './relationshipDisplay';

describe('formatRelationshipLabel', () => {
  it('formats each notation style', () => {
    expect(formatRelationshipLabel('detailed', 'orders', 'customer_id', 'customers', 'id')).toBe(
      'orders.customer_id → customers.id',
    );
    expect(formatRelationshipLabel('columns', 'orders', 'customer_id', 'customers', 'id')).toBe('customer_id → id');
    expect(formatRelationshipLabel('cardinality', 'orders', 'customer_id', 'customers', 'id')).toBe('N → 1');
    expect(formatRelationshipLabel('none', 'orders', 'customer_id', 'customers', 'id')).toBeUndefined();
  });
});
