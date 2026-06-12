/** Map BSON types to TypeScript types. */
export function bsonToTypeScript(bsonType: string | string[] | undefined): string {
  if (bsonType === undefined) return 'unknown';
  if (Array.isArray(bsonType)) {
    return [...new Set(bsonType.map((single) => bsonToTypeScript(single)))].join(' | ');
  }
  switch (bsonType) {
    case 'string':
      return 'string';
    case 'int':
    case 'long':
    case 'double':
    case 'decimal':
      return 'number';
    case 'bool':
      return 'boolean';
    case 'date':
      return 'Date | string';
    case 'array':
      return 'Record<string, unknown>[]';
    case 'object':
      return 'Record<string, unknown>';
    case 'null':
      return 'null';
    default:
      return 'unknown';
  }
}

/** Map BSON types to Python types. */
export function bsonToPython(bsonType: string | string[] | undefined): string {
  if (bsonType === undefined) return 'Any';
  if (Array.isArray(bsonType)) {
    const parts = bsonType.map((single) => bsonToPython(single));
    return parts.includes('None') ? `Optional[${parts.filter((p) => p !== 'None').join(' | ') || 'Any'}]` : parts.join(' | ');
  }
  switch (bsonType) {
    case 'string':
      return 'str';
    case 'int':
    case 'long':
      return 'int';
    case 'double':
    case 'decimal':
      return 'float';
    case 'bool':
      return 'bool';
    case 'date':
      return 'datetime | str';
    case 'array':
      return 'list[dict[str, Any]]';
    case 'object':
      return 'dict[str, Any]';
    case 'null':
      return 'None';
    default:
      return 'Any';
  }
}

/** Map BSON types to Go types. */
export function bsonToGo(bsonType: string | string[] | undefined): string {
  if (bsonType === undefined) return 'interface{}';
  if (Array.isArray(bsonType)) return 'interface{}';
  switch (bsonType) {
    case 'string':
      return 'string';
    case 'int':
    case 'long':
      return 'int64';
    case 'double':
    case 'decimal':
      return 'float64';
    case 'bool':
      return 'bool';
    case 'date':
      return 'time.Time';
    case 'array':
      return '[]bson.M';
    case 'object':
      return 'bson.M';
    default:
      return 'interface{}';
  }
}

/** Map BSON types to Java types. */
export function bsonToJava(bsonType: string | string[] | undefined): string {
  if (bsonType === undefined) return 'Object';
  if (Array.isArray(bsonType)) return 'Object';
  switch (bsonType) {
    case 'string':
      return 'String';
    case 'int':
    case 'long':
      return 'Long';
    case 'double':
    case 'decimal':
      return 'Double';
    case 'bool':
      return 'Boolean';
    case 'date':
      return 'Instant';
    case 'array':
      return 'List<Document>';
    case 'object':
      return 'Document';
    default:
      return 'Object';
  }
}

/** Map BSON types to C# types. */
export function bsonToCSharp(bsonType: string | string[] | undefined): string {
  if (bsonType === undefined) return 'object';
  if (Array.isArray(bsonType)) return 'object?';
  switch (bsonType) {
    case 'string':
      return 'string';
    case 'int':
    case 'long':
      return 'long';
    case 'double':
    case 'decimal':
      return 'double';
    case 'bool':
      return 'bool';
    case 'date':
      return 'DateTime';
    case 'array':
      return 'List<BsonDocument>';
    case 'object':
      return 'BsonDocument';
    default:
      return 'object';
  }
}

/** Map BSON types to Rust types (serde-friendly). */
export function bsonToRust(bsonType: string | string[] | undefined): string {
  if (bsonType === undefined) return 'Bson';
  if (Array.isArray(bsonType)) return 'Option<Bson>';
  switch (bsonType) {
    case 'string':
      return 'String';
    case 'int':
    case 'long':
      return 'i64';
    case 'double':
    case 'decimal':
      return 'f64';
    case 'bool':
      return 'bool';
    case 'date':
      return 'DateTime';
    case 'array':
      return 'Vec<BsonDocument>';
    case 'object':
      return 'BsonDocument';
    default:
      return 'Bson';
  }
}

/** Map BSON types to Ruby types (YARD-style comments). */
export function bsonToRuby(bsonType: string | string[] | undefined): string {
  if (bsonType === undefined) return 'Object';
  if (Array.isArray(bsonType)) return 'Object';
  switch (bsonType) {
    case 'string':
      return 'String';
    case 'int':
    case 'long':
      return 'Integer';
    case 'double':
    case 'decimal':
      return 'Float';
    case 'bool':
      return 'TrueClass, FalseClass';
    case 'date':
      return 'Time, String';
    case 'array':
      return 'Array';
    case 'object':
      return 'Hash';
    default:
      return 'Object';
  }
}

/** Map BSON types to PHP types. */
export function bsonToPhp(bsonType: string | string[] | undefined): string {
  if (bsonType === undefined) return 'mixed';
  if (Array.isArray(bsonType)) return 'mixed';
  switch (bsonType) {
    case 'string':
      return 'string';
    case 'int':
    case 'long':
      return 'int';
    case 'double':
    case 'decimal':
      return 'float';
    case 'bool':
      return 'bool';
    case 'date':
      return '\\MongoDB\\BSON\\UTCDateTime|string';
    case 'array':
      return 'array';
    case 'object':
      return 'array';
    default:
      return 'mixed';
  }
}

/** Map BSON types to Swift types. */
export function bsonToSwift(bsonType: string | string[] | undefined): string {
  if (bsonType === undefined) return 'BSON';
  if (Array.isArray(bsonType)) return 'BSON?';
  switch (bsonType) {
    case 'string':
      return 'String';
    case 'int':
    case 'long':
      return 'Int64';
    case 'double':
    case 'decimal':
      return 'Double';
    case 'bool':
      return 'Bool';
    case 'date':
      return 'Date';
    case 'array':
      return '[Document]';
    case 'object':
      return 'Document';
    default:
      return 'BSON';
  }
}

/** Map BSON types to Scala types. */
export function bsonToScala(bsonType: string | string[] | undefined): string {
  if (bsonType === undefined) return 'Any';
  if (Array.isArray(bsonType)) return 'Any';
  switch (bsonType) {
    case 'string':
      return 'String';
    case 'int':
    case 'long':
      return 'Long';
    case 'double':
    case 'decimal':
      return 'Double';
    case 'bool':
      return 'Boolean';
    case 'date':
      return 'Instant';
    case 'array':
      return 'List[Document]';
    case 'object':
      return 'Document';
    default:
      return 'Any';
  }
}

/** Map BSON types to Kotlin types. */
export function bsonToKotlin(bsonType: string | string[] | undefined): string {
  if (bsonType === undefined) return 'Any';
  if (Array.isArray(bsonType)) return 'Any?';
  switch (bsonType) {
    case 'string':
      return 'String';
    case 'int':
    case 'long':
      return 'Long';
    case 'double':
    case 'decimal':
      return 'Double';
    case 'bool':
      return 'Boolean';
    case 'date':
      return 'Instant';
    case 'array':
      return 'List<Document>';
    case 'object':
      return 'Document';
    default:
      return 'Any';
  }
}

/** Map BSON types to C types (libmongoc). */
export function bsonToC(bsonType: string | string[] | undefined): string {
  if (bsonType === undefined) return 'bson_t';
  switch (bsonType) {
    case 'string':
      return 'const char *';
    case 'int':
    case 'long':
    case 'double':
    case 'decimal':
      return 'int64_t';
    case 'bool':
      return 'bool';
    default:
      return 'bson_t *';
  }
}

/** Map BSON types to C++ types (mongocxx). */
export function bsonToCpp(bsonType: string | string[] | undefined): string {
  if (bsonType === undefined) return 'bsoncxx::document::value';
  if (Array.isArray(bsonType)) return 'bsoncxx::document::value';
  switch (bsonType) {
    case 'string':
      return 'std::string';
    case 'int':
    case 'long':
      return 'int64_t';
    case 'double':
    case 'decimal':
      return 'double';
    case 'bool':
      return 'bool';
    case 'date':
      return 'bsoncxx::types::b_date';
    case 'array':
      return 'bsoncxx::array::view';
    case 'object':
      return 'bsoncxx::document::view';
    default:
      return 'bsoncxx::document::value';
  }
}
