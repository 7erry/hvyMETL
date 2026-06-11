# Outlier Pattern

Design the schema for the typical document, then flag and specially handle
the rare documents that would otherwise break the design.

## Problem it solves

A handful of anomalous entities (a celebrity account with millions of
followers, an e-commerce account with thousands of orders) would force a
worst-case schema on everyone if you designed for them. The Outlier pattern
lets 99.9% of documents stay simple and fast.

## Structure

Normal documents embed their relations directly. When an array hits the
defined threshold, set a flag and spill the overflow into a separate
collection.

```json
{
  "_id": "cust-42",
  "name": "Typical Customer",
  "recentOrders": [ { "orderId": "o-1" }, { "orderId": "o-2" } ]
}
```

```json
{
  "_id": "cust-99",
  "name": "Anomalous Mega Account",
  "recentOrders": [ "...first 50 orders..." ],
  "hasOverflow": true
}
```

Overflow rows live in `customer_order_overflow` keyed by the parent id.

## Application logic

```javascript
const customer = await customers.findOne({ _id: id });
if (customer.hasOverflow) {
  // Only the rare path pays the cost of a second query.
  const extra = await orderOverflow.find({ customerId: id }).toArray();
}
```

## Applicability rules

- Cardinality statistics show a heavy skew: average children per parent is
  small but the maximum is orders of magnitude larger.
- Read-heavy workloads where the common case must stay a single O(1)
  document read.

## Anti-pattern guard

Without this pattern, one mega-account either breaks the 16MB limit or forces
every account into a fully referenced (slower) design.
