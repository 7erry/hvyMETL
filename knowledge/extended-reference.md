# Extended Reference Pattern

Duplicate the handful of frequently-read fields from a referenced document
into the referencing document, so the hot read path never needs a join.

## Problem it solves

In SQL, every order detail page joins orders to customers to addresses. In
MongoDB, a $lookup on every read of a read-heavy workload throws away the
document model's O(1) single-document read advantage.

## Structure

Keep the reference id AND copy the few fields the read path actually needs.
Do not copy the whole referenced document.

```json
{
  "_id": "order-1001",
  "customerId": "cust-42",
  "customer": {
    "name": "Ada Lovelace",
    "tier": "gold",
    "city": "London"
  },
  "items": [ { "sku": "SKU-1", "qty": 2 } ]
}
```

## Keeping duplicates fresh

Duplicated fields are chosen because they rarely change (names, cities,
tiers). When they do change, fan out the update:

```javascript
await customers.updateOne({ _id: custId }, { $set: { tier: "platinum" } });
await orders.updateMany({ customerId: custId }, { $set: { "customer.tier": "platinum" } });
```

## Applicability rules

- Workload is read-heavy (reads >= 70%).
- The referencing document is read at high RPM and always needs the same
  small set of lookup fields.
- The duplicated fields change rarely relative to how often they are read.

## ETL implication

During migration, the extraction query pre-joins the lookup table and selects
the duplicated columns inline so the loaded documents are born complete:

```sql
SELECT o.*, c.name AS "customer.name", c.tier AS "customer.tier"
FROM orders o LEFT JOIN customers c ON c.id = o.customer_id;
```
