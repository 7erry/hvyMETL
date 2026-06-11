# Subset Pattern

Embed only the most relevant N child documents in the parent (the ones the
read path actually shows), and keep the full set in a separate collection.

## Problem it solves

A product page shows the 10 most recent reviews, but the product has 12,000.
Embedding all of them blows up the document (working set no longer fits in
RAM, risk of the 16MB limit); referencing all of them costs a second query on
every page view. The Subset pattern gets the common read in one document
while bounding its size strictly.

## Structure

```json
{
  "_id": "prod-7",
  "name": "Widget Pro",
  "recentReviews": [
    { "user": "ada", "stars": 5, "text": "Great" }
  ]
}
```

Full history lives in a `reviews` collection keyed by `productId`.

## Maintaining the subset atomically

`$push` with `$position` and `$slice` inserts at the front and trims to the
cap in one atomic operation:

```javascript
db.products.updateOne(
  { _id: productId },
  {
    $push: {
      recentReviews: {
        $each: [newReview],
        $position: 0,
        $slice: 10
      }
    }
  }
);
```

## Applicability rules

- Read-heavy parent documents where the UI needs only the newest/top N
  children.
- The child set is large or unbounded: cap N so worst-case document size is
  known at design time.
- Choose N from the actual access pattern (page size), typically 5-20.

## Anti-pattern guard

This is the standard remedy whenever telemetry (growth rate, max children per
parent) shows an embedded array could grow toward the 16MB limit.
