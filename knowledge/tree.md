# Tree Pattern (Materialized Paths and Parent References)

Model hierarchical data (categories, folders, comment threads, org charts)
inside documents so subtree reads do not require recursive joins.

## Problem it solves

SQL adjacency lists need recursive CTEs to answer "all descendants of X".
MongoDB stores the hierarchy information on each node so one indexed query
answers ancestor and subtree questions.

## Structure: materialized path

Each node stores its full ancestor path as a delimited string:

```json
{ "_id": "cat-9", "name": "Laptops", "path": ",electronics,computers," }
```

Subtree query with an anchored regex on the indexed path:

```javascript
db.categories.createIndex({ path: 1 });
db.categories.find({ path: /^,electronics,/ });
```

## Structure: parent reference plus ancestors array

```json
{
  "_id": "cat-9",
  "name": "Laptops",
  "parentId": "cat-4",
  "ancestors": ["cat-1", "cat-4"]
}
```

"All descendants of cat-4" becomes an indexed equality match:

```javascript
db.categories.createIndex({ ancestors: 1 });
db.categories.find({ ancestors: "cat-4" });
```

## Applicability rules

- The SQL source has a self-referencing foreign key (parent_id column).
- Reads ask for subtrees, ancestors, or breadcrumbs frequently.
- Moves/renames of large subtrees are rare (each move rewrites descendant
  paths), which holds for read-heavy CMS and catalog taxonomies.
