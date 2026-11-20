/** Reusable mongosh snippets inserted from the Shell scripts menu. */

export interface MongoShellSnippet {
  id: string;
  label: string;
  script: string;
}

export const MONGO_SHELL_SNIPPETS: readonly MongoShellSnippet[] = [
  {
    id: 'prompt',
    label: 'Environment-aware shell prompt',
    script: `// Add to ~/.mongoshrc.js so the prompt shows replica-set role and database.
prompt = () => {
  let role = "STANDALONE";
  try {
    const hello = db.hello();
    if (hello.setName) {
      role = hello.isWritablePrimary ? "PRIMARY" : hello.secondary ? "SECONDARY" : "OTHER";
    }
  } catch (e) {
    role = "DISCONNECTED";
  }
  return \`[\${role}] \${db.getName()}> \`;
};
`,
  },
  {
    id: 'slow-ops',
    label: 'Find and kill slow operations',
    script: `// List active operations running longer than 5 seconds
db.getSiblingDB("admin").aggregate([
  { $currentOp: { allUsers: true, idleConnections: false } },
  {
    $match: {
      active: true,
      secs_running: { $gt: 5 },
      op: { $in: ["query", "update", "remove", "command"] }
    }
  },
  {
    $project: {
      opid: 1,
      secs_running: 1,
      ns: 1,
      op: 1,
      client: 1,
      command: 1
    }
  }
]).forEach(printjson);

// Terminate a specific blocking operation by its opid
// db.killOp(123456);
`,
  },
  {
    id: 'unused-indexes',
    label: 'Audit unused indexes',
    script: `db.getCollectionNames()
  .filter(name => !name.startsWith("system."))
  .forEach(collName => {
    const unused = db.getCollection(collName).aggregate([
      { $indexStats: {} },
      { $match: { "accesses.ops": 0, name: { $ne: "_id_" } } },
      { $project: { name: 1, key: 1, since: "$accesses.since" } }
    ]).toArray();

    if (unused.length > 0) {
      print(\`\\nCollection: \${collName}\`);
      printjson(unused);
    }
  });
`,
  },
  {
    id: 'storage-report',
    label: 'Collection storage and index overhead',
    script: `const toMB = bytes => (bytes / (1024 * 1024)).toFixed(2);

const report = db.getCollectionNames()
  .filter(name => !name.startsWith("system."))
  .map(name => {
    const stats = db.getCollection(name).stats();
    return {
      collection: name,
      docs: stats.count,
      dataMB: Number(toMB(stats.size)),
      storageMB: Number(toMB(stats.storageSize)),
      indexMB: Number(toMB(stats.totalIndexSize))
    };
  })
  .sort((a, b) => b.storageMB - a.storageMB);

console.table(report);
`,
  },
  {
    id: 'schema-inspector',
    label: 'Dynamic schema and BSON type inspector',
    script: `function inspectSchema(collName, sampleSize = 500) {
  const schema = {};
  db.getCollection(collName)
    .aggregate([{ $sample: { size: sampleSize } }])
    .forEach(doc => {
      Object.entries(doc).forEach(([key, val]) => {
        const type = val === null ? "null" : val._bsontype || (Array.isArray(val) ? "array" : typeof val);
        if (!schema[key]) schema[key] = {};
        schema[key][type] = (schema[key][type] || 0) + 1;
      });
    });
  printjson(schema);
}

// Usage:
inspectSchema("orders", 1000);
`,
  },
  {
    id: 'batched-delete',
    label: 'Throttled batched deletes',
    script: `function batchedDelete(collName, filter, batchSize = 1000, pauseMs = 100) {
  const coll = db.getCollection(collName);
  let totalDeleted = 0;

  while (true) {
    const ids = coll
      .find(filter, { _id: 1 })
      .limit(batchSize)
      .toArray()
      .map(doc => doc._id);

    if (ids.length === 0) break;

    const res = coll.deleteMany({ _id: { $in: ids } });
    totalDeleted += res.deletedCount;
    print(\`Deleted \${totalDeleted} documents so far...\`);
    sleep(pauseMs);
  }

  print(\`Done. Total deleted: \${totalDeleted}\`);
}

// Usage:
// batchedDelete("logs", { createdAt: { $lt: new Date("2025-01-01") } }, 2000, 150);
`,
  },
  {
    id: 'replication-lag',
    label: 'Replication lag and oplog window',
    script: `print("=== Oplog Window ===");
printjson(db.getReplicationInfo());

print("\\n=== Secondary Lag ===");
printjson(db.getSecondaryReplicationInfo());
`,
  },
];
