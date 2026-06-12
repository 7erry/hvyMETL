# Single Collection Pattern

Store related entity documents of different types in **one collection**, linked
by a `links[]` array so graph reads need no `$lookup` or SQL-style joins.

Official reference: [MongoDB Manual — Single Collection Pattern](https://www.mongodb.com/docs/manual/data-modeling/design-patterns/single-collection/)

## Problem it solves

Many-to-many relationships (students ↔ classes, users ↔ groups) often duplicate
entity payloads when each side embeds the other. The Single Collection pattern
keeps **one copy** of each entity while still allowing single-query traversals
via indexed `links`.

## Structure

Class document:

```json
{
  "_id": "CS101-001",
  "docType": "class",
  "className": "Introduction to Programming",
  "links": [
    { "target": "CS101-001", "docType": "class" },
    { "target": "S12345", "docType": "student" }
  ]
}
```

Student document in the **same collection**:

```json
{
  "_id": "S12345",
  "docType": "student",
  "name": "Jane Doe",
  "links": [
    { "target": "CS101-001", "docType": "class" },
    { "target": "S12345", "docType": "student" }
  ]
}
```

## Querying

One query returns a student and every linked class (no join):

```javascript
db.students_classes.find({ "links.target": "S12345" });
```

## Index spec

```javascript
db.students_classes.createIndex({ "links.target": 1, "links.docType": 1 });
db.students_classes.createIndex({ docType: 1 });
```

## Applicability rules

- Two (or more) peer entity tables connect through a junction / enrollment table.
- The workload has high write velocity or low-latency graph reads (mobile,
  realtime analytics, high peak RPM).
- Entities are updated independently but queried together frequently.
- Distinct from the **Polymorphic** pattern (one SQL table with a type column and
  sparse variant columns) — Single Collection merges **separate** entity tables.

## hvyMETL automation

When a junction-linked entity pair qualifies, the design engine absorbs the
entities into one hub collection, adds `docType` + `links[]` to the schema, and
ETL emits one CSV stream per entity table with a literal `docType` column.
