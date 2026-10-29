use mongodb::bson::{doc, Bson, Document};
use mongodb::sync::Client as MongoClient;
use mysql_async::prelude::Queryable;
use mysql_async::Pool;
use rusqlite::Connection as SqliteConnection;
use serde_json::{json, Value};
use tiberius::{AuthMethod, Client as MssqlClient, Config as MssqlConfig};
use tokio::net::TcpStream;
use tokio_postgres::{types::ToSql, NoTls};
use tokio_util::compat::TokioAsyncWriteCompatExt;

use crate::catalog::public_error;
use crate::engine::{schema_name, sqlite_path, Engine};

#[derive(Debug, Clone)]
pub struct ExtractTable {
    pub name: String,
    pub columns: Vec<String>,
    pub checkpoint: Option<String>,
}

#[derive(Debug)]
pub struct ExtractChunk {
    pub checkpoint: String,
    pub rows: Vec<Vec<Value>>,
    pub eof: bool,
}

pub async fn extract_next_chunk(
    uri: &str,
    database: &str,
    engine: Engine,
    table: &ExtractTable,
    chunk_rows: usize,
) -> Result<ExtractChunk, String> {
    match engine {
        Engine::Postgresql => extract_postgres(uri, database, table, chunk_rows).await,
        Engine::Mysql => extract_mysql(uri, database, table, chunk_rows).await,
        Engine::Mssql => extract_mssql(uri, database, table, chunk_rows).await,
        Engine::Sqlite => extract_sqlite(uri, table, chunk_rows).await,
        Engine::Mongodb => extract_mongo(uri, database, table, chunk_rows),
    }
}

async fn extract_postgres(
    uri: &str,
    database: &str,
    table: &ExtractTable,
    chunk_rows: usize,
) -> Result<ExtractChunk, String> {
    let schema = schema_name(uri, Engine::Postgresql);
    let connection_uri = rewrite_database(uri, database)?;
    let (client, connection) = tokio_postgres::connect(&connection_uri, NoTls)
        .await
        .map_err(public_error)?;
    tokio::spawn(async move {
        let _ = connection.await;
    });

    let pk = primary_key_postgres(&client, &schema, &table.name).await?;
    if pk.is_empty() {
        return Err(format!(
            "Table {} has no primary key; restartable extract requires a primary key.",
            table.name
        ));
    }
    let select_cols = table
        .columns
        .iter()
        .map(|column| quote_ident(column))
        .collect::<Vec<_>>()
        .join(", ");
    let pk_cols = pk.iter().map(|column| quote_ident(column)).collect::<Vec<_>>().join(", ");
    let (sql, params): (String, Vec<String>) = match &table.checkpoint {
        Some(checkpoint) => {
            let values = decode_checkpoint(checkpoint)?;
            if values.len() != pk.len() {
                return Err("Checkpoint does not match primary key.".to_string());
            }
            let predicates = pk
                .iter()
                .enumerate()
                .map(|(index, _)| format!("${}", index + 1))
                .collect::<Vec<_>>()
                .join(", ");
            (
                format!(
                    "SELECT {select_cols} FROM {}.{} WHERE ({pk_cols}) > ({predicates}) ORDER BY {pk_cols} LIMIT {chunk_rows}",
                    quote_ident(&schema),
                    quote_ident(&table.name)
                ),
                values,
            )
        }
        None => (
            format!(
                "SELECT {select_cols} FROM {}.{} ORDER BY {pk_cols} LIMIT {chunk_rows}",
                quote_ident(&schema),
                quote_ident(&table.name)
            ),
            Vec::new(),
        ),
    };

    let rows = if params.is_empty() {
        client.query(&sql, &[]).await.map_err(public_error)?
    } else {
        let refs: Vec<&(dyn ToSql + Sync)> = params.iter().map(|value| value as &(dyn ToSql + Sync)).collect();
        client.query(&sql, refs.as_slice()).await.map_err(public_error)?
    };

    let mut out_rows = Vec::new();
    let mut last_pk: Vec<String> = Vec::new();
    for row in &rows {
        let mut values = Vec::new();
        for (index, _) in table.columns.iter().enumerate() {
            values.push(pg_value_to_json(&row, index));
        }
        last_pk = pk
            .iter()
            .filter_map(|name| {
                let index = table.columns.iter().position(|column| column == name)?;
                Some(json_cell_string(&values[index]))
            })
            .collect();
        out_rows.push(values);
    }
    let eof = out_rows.len() < chunk_rows;
    let checkpoint = if last_pk.is_empty() {
        table.checkpoint.clone().unwrap_or_else(|| "0".to_string())
    } else {
        encode_checkpoint(&last_pk)
    };
    Ok(ExtractChunk {
        checkpoint,
        rows: out_rows,
        eof,
    })
}

async fn primary_key_postgres(client: &tokio_postgres::Client, schema: &str, table: &str) -> Result<Vec<String>, String> {
    let rows = client
        .query(
            "SELECT kcu.column_name
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
             WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1 AND tc.table_name = $2
             ORDER BY kcu.ordinal_position",
            &[&schema, &table],
        )
        .await
        .map_err(public_error)?;
    Ok(rows.iter().map(|row| row.get::<_, String>(0)).collect())
}

async fn extract_mysql(
    uri: &str,
    database: &str,
    table: &ExtractTable,
    chunk_rows: usize,
) -> Result<ExtractChunk, String> {
    let connection_uri = rewrite_database(uri, database)?;
    let pool = Pool::new(connection_uri.as_str());
    let mut conn = pool.get_conn().await.map_err(public_error)?;
    let pk: Vec<String> = conn
        .exec_map(
            "SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'
             ORDER BY ORDINAL_POSITION",
            (database, &table.name),
            |name: String| name,
        )
        .await
        .map_err(public_error)?;
    if pk.is_empty() {
        return Err(format!(
            "Table {} has no primary key; restartable extract requires a primary key.",
            table.name
        ));
    }
    let select_cols = table
        .columns
        .iter()
        .map(|column| format!("`{}`", column.replace('`', "``")))
        .collect::<Vec<_>>()
        .join(", ");
    let pk_cols = pk
        .iter()
        .map(|column| format!("`{}`", column.replace('`', "``")))
        .collect::<Vec<_>>()
        .join(", ");
    let (sql, params): (String, Vec<String>) = match &table.checkpoint {
        Some(checkpoint) => {
            let values = decode_checkpoint(checkpoint)?;
            let placeholders = values.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
            (
                format!(
                    "SELECT {select_cols} FROM `{database}`.`{}` WHERE ({pk_cols}) > ({placeholders}) ORDER BY {pk_cols} LIMIT {chunk_rows}",
                    table.name.replace('`', "``")
                ),
                values,
            )
        }
        None => (
            format!(
                "SELECT {select_cols} FROM `{database}`.`{}` ORDER BY {pk_cols} LIMIT {chunk_rows}",
                table.name.replace('`', "``")
            ),
            Vec::new(),
        ),
    };
    let rows: Vec<mysql_async::Row> = conn.exec(sql, params).await.map_err(public_error)?;
    let mut out_rows = Vec::new();
    let mut last_pk = Vec::new();
    for row in rows {
        let mut values = Vec::new();
        for (index, _) in table.columns.iter().enumerate() {
            let raw: Option<mysql_async::Value> = row.as_ref(index).cloned();
            values.push(mysql_value_to_json(raw));
        }
        last_pk = pk
            .iter()
            .filter_map(|name| {
                let index = table.columns.iter().position(|column| column == name)?;
                Some(json_cell_string(&values[index]))
            })
            .collect();
        out_rows.push(values);
    }
    drop(conn);
    pool.disconnect().await.map_err(public_error)?;
    let eof = out_rows.len() < chunk_rows;
    let checkpoint = if last_pk.is_empty() {
        table.checkpoint.clone().unwrap_or_else(|| "0".to_string())
    } else {
        encode_checkpoint(&last_pk)
    };
    Ok(ExtractChunk {
        checkpoint,
        rows: out_rows,
        eof,
    })
}

async fn extract_mssql(
    uri: &str,
    database: &str,
    table: &ExtractTable,
    chunk_rows: usize,
) -> Result<ExtractChunk, String> {
    let schema = schema_name(uri, Engine::Mssql);
    let (config, host, port) = mssql_config(uri, database)?;
    let tcp = TcpStream::connect((host.as_str(), port))
        .await
        .map_err(public_error)?;
    tcp.set_nodelay(true).map_err(public_error)?;
    let mut client = MssqlClient::connect(config, tcp.compat_write())
        .await
        .map_err(public_error)?;

    let pk_rows = client
        .query(
            "SELECT kcu.COLUMN_NAME
             FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
             JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
               ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
             WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_CATALOG = @P1 AND tc.TABLE_SCHEMA = @P2 AND tc.TABLE_NAME = @P3
             ORDER BY kcu.ORDINAL_POSITION",
            &[&database, &schema, &table.name],
        )
        .await
        .map_err(public_error)?
        .into_first_result()
        .await
        .map_err(public_error)?;
    let pk: Vec<String> = pk_rows
        .iter()
        .filter_map(|row| row.get::<&str, usize>(0).map(str::to_string))
        .collect();
    if pk.is_empty() {
        return Err(format!(
            "Table {} has no primary key; restartable extract requires a primary key.",
            table.name
        ));
    }

    let select_cols = table
        .columns
        .iter()
        .map(|column| format!("[{}]", column.replace(']', "]]")))
        .collect::<Vec<_>>()
        .join(", ");
    let pk_cols = pk
        .iter()
        .map(|column| format!("[{}]", column.replace(']', "]]")))
        .collect::<Vec<_>>()
        .join(", ");
    let query = match &table.checkpoint {
        Some(checkpoint) => {
            let values = decode_checkpoint(checkpoint)?;
            let predicates = values
                .iter()
                .map(|value| format!("N'{}'", value.replace('\'', "''")))
                .collect::<Vec<_>>()
                .join(", ");
            format!(
                "SELECT TOP ({chunk_rows}) {select_cols} FROM [{schema}].[{}] WHERE ({pk_cols}) > ({predicates}) ORDER BY {pk_cols}",
                table.name.replace(']', "]]")
            )
        }
        None => format!(
            "SELECT TOP ({chunk_rows}) {select_cols} FROM [{schema}].[{}] ORDER BY {pk_cols}",
            table.name.replace(']', "]]")
        ),
    };
    let sql = client
        .query(&query, &[])
        .await
        .map_err(public_error)?
        .into_first_result()
        .await
        .map_err(public_error)?;

    let mut out_rows = Vec::new();
    let mut last_pk = Vec::new();
    for row in &sql {
        let mut values = Vec::new();
        for (index, _) in table.columns.iter().enumerate() {
            values.push(mssql_value_to_json(row, index));
        }
        last_pk = pk
            .iter()
            .filter_map(|name| {
                let index = table.columns.iter().position(|column| column == name)?;
                Some(json_cell_string(&values[index]))
            })
            .collect();
        out_rows.push(values);
    }
    let eof = out_rows.len() < chunk_rows;
    let checkpoint = if last_pk.is_empty() {
        table.checkpoint.clone().unwrap_or_else(|| "0".to_string())
    } else {
        encode_checkpoint(&last_pk)
    };
    Ok(ExtractChunk {
        checkpoint,
        rows: out_rows,
        eof,
    })
}

async fn extract_sqlite(uri: &str, table: &ExtractTable, chunk_rows: usize) -> Result<ExtractChunk, String> {
    let path = sqlite_path(uri)?;
    let table = table.clone();
    tokio::task::spawn_blocking(move || {
        let conn = SqliteConnection::open(&path).map_err(public_error)?;
        let pk = sqlite_primary_key(&conn, &table.name)?;
        let order = if pk.is_empty() {
            "rowid".to_string()
        } else {
            pk.iter().map(|column| quote_ident(column)).collect::<Vec<_>>().join(", ")
        };
        let select_cols = table
            .columns
            .iter()
            .map(|column| quote_ident(column))
            .collect::<Vec<_>>()
            .join(", ");
        let (sql, params): (String, Vec<String>) = match &table.checkpoint {
            Some(checkpoint) => {
                let values = decode_checkpoint(checkpoint)?;
                if pk.is_empty() {
                    (
                        format!(
                            "SELECT {select_cols} FROM {} WHERE rowid > ?1 ORDER BY rowid LIMIT {chunk_rows}",
                            quote_ident(&table.name)
                        ),
                        values,
                    )
                } else {
                    let placeholders = values
                        .iter()
                        .enumerate()
                        .map(|(index, _)| format!("?{}", index + 1))
                        .collect::<Vec<_>>()
                        .join(", ");
                    (
                        format!(
                            "SELECT {select_cols} FROM {} WHERE ({order}) > ({placeholders}) ORDER BY {order} LIMIT {chunk_rows}",
                            quote_ident(&table.name)
                        ),
                        values,
                    )
                }
            }
            None => (
                format!(
                    "SELECT {select_cols} FROM {} ORDER BY {order} LIMIT {chunk_rows}",
                    quote_ident(&table.name)
                ),
                Vec::new(),
            ),
        };
        let mut stmt = conn.prepare(&sql).map_err(public_error)?;
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|value| value as &dyn rusqlite::types::ToSql).collect();
        let mapped = stmt
            .query_map(param_refs.as_slice(), |row| {
                let mut values = Vec::new();
                for index in 0..table.columns.len() {
                    values.push(sqlite_value_to_json(row, index)?);
                }
                Ok(values)
            })
            .map_err(public_error)?;
        let mut out_rows = Vec::new();
        let mut last_pk = Vec::new();
        for item in mapped {
            let values = item.map_err(public_error)?;
            if pk.is_empty() {
                // rowid not in columns; use last stringified first column as coarse cursor when needed
                last_pk = vec![json_cell_string(values.first().unwrap_or(&Value::Null))];
            } else {
                last_pk = pk
                    .iter()
                    .filter_map(|name| {
                        let index = table.columns.iter().position(|column| column == name)?;
                        Some(json_cell_string(&values[index]))
                    })
                    .collect();
            }
            out_rows.push(values);
        }
        let eof = out_rows.len() < chunk_rows;
        let checkpoint = if last_pk.is_empty() {
            table.checkpoint.clone().unwrap_or_else(|| "0".to_string())
        } else {
            encode_checkpoint(&last_pk)
        };
        Ok(ExtractChunk {
            checkpoint,
            rows: out_rows,
            eof,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

fn sqlite_primary_key(conn: &SqliteConnection, table: &str) -> Result<Vec<String>, String> {
    let pragma = format!("PRAGMA table_info({})", quote_ident(table));
    let mut stmt = conn.prepare(&pragma).map_err(public_error)?;
    let mut pk = Vec::new();
    let rows = stmt
        .query_map([], |row| {
            let name: String = row.get(1)?;
            let pk: i32 = row.get(5)?;
            Ok((pk, name))
        })
        .map_err(public_error)?;
    let mut pairs = Vec::new();
    for row in rows {
        pairs.push(row.map_err(public_error)?);
    }
    pairs.sort_by_key(|(pk, _)| *pk);
    for (ordinal, name) in pairs {
        if ordinal > 0 {
            pk.push(name);
        }
    }
    Ok(pk)
}

fn extract_mongo(uri: &str, database: &str, table: &ExtractTable, chunk_rows: usize) -> Result<ExtractChunk, String> {
    let client = MongoClient::with_uri_str(uri).map_err(public_error)?;
    let collection = client.database(database).collection::<Document>(&table.name);
    let filter = match &table.checkpoint {
        Some(checkpoint) if !checkpoint.is_empty() && checkpoint != "0" => {
            match bson_from_checkpoint(checkpoint) {
                Some(value) => doc! { "_id": { "$gt": value } },
                None => Document::new(),
            }
        }
        _ => Document::new(),
    };
    let cursor = collection
        .find(filter)
        .sort(doc! { "_id": 1 })
        .limit(chunk_rows as i64)
        .run()
        .map_err(public_error)?;
    let mut out_rows = Vec::new();
    let mut last_id = table.checkpoint.clone().unwrap_or_default();
    for document in cursor {
        let document = document.map_err(public_error)?;
        if let Some(id) = document.get("_id") {
            last_id = bson_checkpoint(id);
        }
        let mut values = Vec::new();
        for column in &table.columns {
            values.push(bson_to_json(document.get(column).unwrap_or(&Bson::Null)));
        }
        out_rows.push(values);
    }
    let eof = out_rows.len() < chunk_rows;
    Ok(ExtractChunk {
        checkpoint: if last_id.is_empty() { "0".to_string() } else { last_id },
        rows: out_rows,
        eof,
    })
}

fn rewrite_database(uri: &str, database: &str) -> Result<String, String> {
    let mut url = url::Url::parse(uri).map_err(|_| "Database URI is not valid.".to_string())?;
    url.set_path(&format!("/{database}"));
    Ok(url.to_string())
}

fn mssql_config(uri: &str, database: &str) -> Result<(MssqlConfig, String, u16), String> {
    let url = url::Url::parse(uri).map_err(|_| "Database URI is not valid.".to_string())?;
    let host = url.host_str().unwrap_or("localhost").to_string();
    let port = url.port().unwrap_or(1433);
    let mut config = MssqlConfig::new();
    config.host(&host);
    config.port(port);
    config.database(database);
    let user = url.username().to_string();
    let password = url.password().unwrap_or("").to_string();
    config.authentication(AuthMethod::sql_server(user, password));
    config.encryption(tiberius::EncryptionLevel::Required);
    config.trust_cert();
    Ok((config, host, port))
}

fn encode_checkpoint(values: &[String]) -> String {
    values.join("\u{1f}")
}

fn decode_checkpoint(checkpoint: &str) -> Result<Vec<String>, String> {
    Ok(checkpoint.split('\u{1f}').map(str::to_string).collect())
}

fn quote_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

fn json_cell_string(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(text) => text.clone(),
        other => other.to_string(),
    }
}

fn pg_value_to_json(row: &tokio_postgres::Row, index: usize) -> Value {
    if let Ok(value) = row.try_get::<_, Option<String>>(index) {
        return match value {
            Some(text) => Value::String(text),
            None => Value::Null,
        };
    }
    if let Ok(value) = row.try_get::<_, Option<i64>>(index) {
        return match value {
            Some(number) => json!(number),
            None => Value::Null,
        };
    }
    if let Ok(value) = row.try_get::<_, Option<f64>>(index) {
        return match value {
            Some(number) => json!(number),
            None => Value::Null,
        };
    }
    if let Ok(value) = row.try_get::<_, Option<bool>>(index) {
        return match value {
            Some(flag) => Value::Bool(flag),
            None => Value::Null,
        };
    }
    Value::Null
}

fn mysql_value_to_json(value: Option<mysql_async::Value>) -> Value {
    match value {
        None | Some(mysql_async::Value::NULL) => Value::Null,
        Some(mysql_async::Value::Bytes(bytes)) => Value::String(String::from_utf8_lossy(&bytes).into_owned()),
        Some(mysql_async::Value::Int(number)) => json!(number),
        Some(mysql_async::Value::UInt(number)) => json!(number),
        Some(mysql_async::Value::Float(number)) => json!(number),
        Some(mysql_async::Value::Double(number)) => json!(number),
        Some(other) => Value::String(format!("{other:?}")),
    }
}

fn mssql_value_to_json(row: &tiberius::Row, index: usize) -> Value {
    if let Ok(Some(value)) = row.try_get::<&str, usize>(index) {
        return Value::String(value.to_string());
    }
    if let Ok(Some(value)) = row.try_get::<i64, usize>(index) {
        return json!(value);
    }
    if let Ok(Some(value)) = row.try_get::<i32, usize>(index) {
        return json!(value);
    }
    if let Ok(Some(value)) = row.try_get::<f64, usize>(index) {
        return json!(value);
    }
    if let Ok(Some(value)) = row.try_get::<bool, usize>(index) {
        return Value::Bool(value);
    }
    Value::Null
}

fn sqlite_value_to_json(row: &rusqlite::Row<'_>, index: usize) -> rusqlite::Result<Value> {
    match row.get_ref(index)? {
        rusqlite::types::ValueRef::Null => Ok(Value::Null),
        rusqlite::types::ValueRef::Integer(number) => Ok(json!(number)),
        rusqlite::types::ValueRef::Real(number) => Ok(json!(number)),
        rusqlite::types::ValueRef::Text(text) => Ok(Value::String(String::from_utf8_lossy(text).into_owned())),
        rusqlite::types::ValueRef::Blob(_) => Ok(Value::String("<blob>".to_string())),
    }
}

fn bson_to_json(value: &Bson) -> Value {
    match value {
        Bson::Null | Bson::Undefined => Value::Null,
        Bson::String(text) => Value::String(text.clone()),
        Bson::Boolean(flag) => Value::Bool(*flag),
        Bson::Int32(number) => json!(number),
        Bson::Int64(number) => json!(number),
        Bson::Double(number) => json!(number),
        Bson::ObjectId(oid) => Value::String(oid.to_hex()),
        Bson::DateTime(date) => Value::String(date.try_to_rfc3339_string().unwrap_or_else(|_| date.to_string())),
        other => Value::String(other.to_string()),
    }
}

fn bson_checkpoint(value: &Bson) -> String {
    match value {
        Bson::ObjectId(oid) => format!("oid:{}", oid.to_hex()),
        Bson::String(text) => format!("str:{text}"),
        Bson::Int32(number) => format!("i32:{number}"),
        Bson::Int64(number) => format!("i64:{number}"),
        other => format!("raw:{other}"),
    }
}

fn bson_from_checkpoint(checkpoint: &str) -> Option<Bson> {
    if let Some(hex) = checkpoint.strip_prefix("oid:") {
        return mongodb::bson::oid::ObjectId::parse_str(hex).ok().map(Bson::ObjectId);
    }
    if let Some(text) = checkpoint.strip_prefix("str:") {
        return Some(Bson::String(text.to_string()));
    }
    if let Some(number) = checkpoint.strip_prefix("i32:") {
        return number.parse().ok().map(Bson::Int32);
    }
    if let Some(number) = checkpoint.strip_prefix("i64:") {
        return number.parse().ok().map(Bson::Int64);
    }
    None
}
