use std::collections::{BTreeSet, HashMap};

use mongodb::bson::{Bson, Document};
use serde_json::{json, Value};

const SAMPLE_LIMIT: i64 = 50;

struct FieldStats {
    types: BTreeSet<String>,
    present: usize,
    nulls: usize,
}

/// BSON type name used by the studio column model. Null adds no type.
pub fn bson_type_name(value: &Bson) -> Option<&'static str> {
    match value {
        Bson::Null | Bson::Undefined => None,
        Bson::ObjectId(_) => Some("objectId"),
        Bson::String(_) | Bson::Symbol(_) | Bson::RegularExpression(_) | Bson::JavaScriptCode(_) | Bson::JavaScriptCodeWithScope(_) | Bson::DbPointer(_) => {
            Some("string")
        }
        Bson::Int32(_) => Some("int"),
        Bson::Int64(_) => Some("long"),
        Bson::Double(_) => Some("double"),
        Bson::Decimal128(_) => Some("decimal"),
        Bson::Boolean(_) => Some("bool"),
        Bson::DateTime(_) => Some("date"),
        Bson::Timestamp(_) => Some("timestamp"),
        Bson::Document(_) => Some("object"),
        Bson::Array(_) => Some("array"),
        Bson::Binary(_) => Some("binData"),
        Bson::MaxKey | Bson::MinKey => Some("string"),
    }
}

fn sql_type(bson_type: &str) -> &'static str {
    match bson_type {
        "objectId" => "VARCHAR(24)",
        "date" | "timestamp" => "TIMESTAMP",
        "long" => "BIGINT",
        "decimal" => "DECIMAL",
        "int" => "INTEGER",
        "double" => "DOUBLE",
        "bool" => "BOOLEAN",
        "object" | "array" | "mixed" => "JSON",
        "binData" => "BLOB",
        "string" => "VARCHAR(255)",
        _ => "VARCHAR(255)",
    }
}

fn is_ident(name: &str) -> bool {
    let mut chars = name.chars();
    match chars.next() {
        Some(first) if first.is_ascii_alphabetic() || first == '_' => chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_'),
        _ => false,
    }
}

fn table_name(name: &str) -> String {
    if is_ident(name) {
        return name.to_string();
    }
    let slug: String = name
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch.to_ascii_lowercase() } else { '_' })
        .collect();
    let trimmed = slug.trim_matches('_').to_string();
    if trimmed.is_empty() { "documents".to_string() } else { trimmed }
}

fn column_json(name: &str, stats: &FieldStats, documents: usize, primary_key: bool) -> Value {
    let types: Vec<&str> = stats.types.iter().map(String::as_str).collect();
    let mixed = types.len() > 1;
    let bson_type = if mixed { "mixed" } else { types.first().copied().unwrap_or("string") };
    let mut column = json!({
        "name": name,
        "sqlType": sql_type(bson_type),
        "bsonType": bson_type,
        "nullable": !primary_key && (stats.nulls > 0 || stats.present < documents),
        "isPrimaryKey": primary_key,
    });
    if mixed {
        column["observedBsonTypes"] = json!(types);
    }
    column
}

/// One table from a bounded document sample. Nested values stay a single JSON column.
pub fn table_from_documents(name: &str, documents: &[Document]) -> Value {
    let mut order = Vec::new();
    let mut fields: HashMap<String, FieldStats> = HashMap::new();
    for document in documents {
        for (key, value) in document {
            let stats = fields.entry(key.clone()).or_insert_with(|| {
                order.push(key.clone());
                FieldStats { types: BTreeSet::new(), present: 0, nulls: 0 }
            });
            stats.present += 1;
            match bson_type_name(value) {
                Some(kind) => {
                    stats.types.insert(kind.to_string());
                }
                None => stats.nulls += 1,
            }
        }
    }
    let primary = if fields.contains_key("_id") {
        "_id"
    } else if fields.contains_key("id") {
        "id"
    } else {
        order.first().map(String::as_str).unwrap_or("_id")
    };
    let columns: Vec<Value> = order
        .iter()
        .filter_map(|key| fields.get(key).map(|stats| column_json(key, stats, documents.len(), key == primary)))
        .collect();
    json!({
        "name": table_name(name),
        "columns": columns,
        "primaryKey": if fields.is_empty() { Vec::<String>::new() } else { vec![primary.to_string()] },
        "foreignKeys": [],
        "rowCount": documents.len(),
    })
}

pub fn sample_limit() -> i64 {
    SAMPLE_LIMIT
}

pub fn schema_payload(database: &str, tables: Vec<Value>) -> Value {
    json!({
        "model": {
            "source": "ddl:mongodb-json",
            "tables": tables,
            "relationships": [],
        },
        "ddl": format!("// Live MongoDB database {database}. Schema inferred from a sample of documents.\n"),
        "dialect": "mongodb-json",
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use mongodb::bson::{doc, oid::ObjectId};

    #[test]
    fn infers_top_level_columns_and_keeps_nested_objects_as_json() {
        let documents = vec![doc! {
            "_id": ObjectId::new(),
            "name": "Ada",
            "host": { "name": "Ada" },
            "price": 12.5,
        }];
        let table = table_from_documents("listingsAndReviews", &documents);
        assert_eq!(table["name"], "listingsAndReviews");
        assert_eq!(table["primaryKey"][0], "_id");
        let columns = table["columns"].as_array().expect("columns");
        let host = columns.iter().find(|column| column["name"] == "host").expect("host");
        assert_eq!(host["bsonType"], "object");
        assert_eq!(host["sqlType"], "JSON");
        let price = columns.iter().find(|column| column["name"] == "price").expect("price");
        assert_eq!(price["bsonType"], "double");
    }
}
