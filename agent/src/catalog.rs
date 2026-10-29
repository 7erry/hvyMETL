use mongodb::bson::Document;
use mongodb::sync::Client as MongoClient;
use mysql_async::prelude::Queryable;
use mysql_async::Pool;
use rusqlite::Connection as SqliteConnection;
use serde_json::{json, Value};
use tiberius::{AuthMethod, Client as MssqlClient, Config as MssqlConfig};
use tokio::net::TcpStream;
use tokio_postgres::NoTls;
use tokio_util::compat::TokioAsyncWriteCompatExt;

use crate::engine::{database_name, schema_name, sqlite_path, Engine};
use crate::schema::{sample_limit, schema_payload, table_from_documents};

pub async fn introspect(uri: &str, database: &str, engine: Engine) -> Result<Value, String> {
    match engine {
        Engine::Mongodb => introspect_mongo(uri, database),
        Engine::Postgresql => introspect_postgres(uri, database).await,
        Engine::Mysql => introspect_mysql(uri, database).await,
        Engine::Mssql => introspect_mssql(uri, database).await,
        Engine::Sqlite => introspect_sqlite(uri).await,
    }
}

fn introspect_mongo(uri: &str, database: &str) -> Result<Value, String> {
    let client = MongoClient::with_uri_str(uri).map_err(public_error)?;
    let db = client.database(database);
    let names = db.list_collection_names().run().map_err(public_error)?;
    let mut tables = Vec::new();
    for name in names {
        if name.starts_with("system.") {
            continue;
        }
        let collection = db.collection::<Document>(&name);
        let cursor = collection
            .find(Document::new())
            .limit(sample_limit())
            .run()
            .map_err(public_error)?;
        let mut documents = Vec::new();
        for document in cursor {
            documents.push(document.map_err(public_error)?);
            if documents.len() as i64 >= sample_limit() {
                break;
            }
        }
        if documents.is_empty() {
            continue;
        }
        tables.push(table_from_documents(&name, &documents));
    }
    if tables.is_empty() {
        return Err("MongoDB database has no documents to infer a schema from.".to_string());
    }
    Ok(schema_payload(database, tables))
}

async fn introspect_postgres(uri: &str, database: &str) -> Result<Value, String> {
    let schema = schema_name(uri, Engine::Postgresql);
    let connection_uri = rewrite_database(uri, database)?;
    let (client, connection) = tokio_postgres::connect(&connection_uri, NoTls)
        .await
        .map_err(public_error)?;
    tokio::spawn(async move {
        let _ = connection.await;
    });

    let columns = client
        .query(
            "SELECT table_name, column_name, data_type, is_nullable, ordinal_position
             FROM information_schema.columns
             WHERE table_schema = $1
             ORDER BY table_name, ordinal_position",
            &[&schema],
        )
        .await
        .map_err(public_error)?;
    let keys = client
        .query(
            "SELECT kcu.table_name, kcu.column_name, kcu.ordinal_position
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
             WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1",
            &[&schema],
        )
        .await
        .map_err(public_error)?;
    let foreign_keys = client
        .query(
            "SELECT kcu.table_name, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
             JOIN information_schema.constraint_column_usage ccu
               ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
             WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1",
            &[&schema],
        )
        .await
        .map_err(public_error)?;
    let sizes = client
        .query(
            "SELECT c.relname AS table_name, GREATEST(c.reltuples, 0)::bigint AS row_count
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = $1 AND c.relkind = 'r'",
            &[&schema],
        )
        .await
        .map_err(public_error)?;

    let mut pk = std::collections::HashMap::new();
    for row in &keys {
        let table: String = row.get(0);
        let column: String = row.get(1);
        let ordinal: i32 = row.get(2);
        pk.insert(format!("{table}.{column}"), ordinal);
    }
    let mut size_map = std::collections::HashMap::new();
    for row in &sizes {
        let table: String = row.get(0);
        let count: i64 = row.get(1);
        size_map.insert(table, count);
    }
    let mut by_table: std::collections::BTreeMap<String, Vec<Value>> = std::collections::BTreeMap::new();
    for row in &columns {
        let table: String = row.get(0);
        let name: String = row.get(1);
        let sql_type: String = row.get(2);
        let nullable: String = row.get(3);
        let ordinal: i32 = row.get(4);
        let key = format!("{table}.{name}");
        let is_pk = pk.contains_key(&key);
        by_table.entry(table).or_default().push(json!({
            "name": name,
            "sqlType": sql_type,
            "bsonType": sql_to_bson(&sql_type),
            "nullable": nullable == "YES" && !is_pk,
            "isPrimaryKey": is_pk,
            "ordinal": ordinal,
            "pkOrdinal": pk.get(&key).copied().unwrap_or(0),
        }));
    }
    let mut fk_by_table: std::collections::HashMap<String, Vec<Value>> = std::collections::HashMap::new();
    for row in &foreign_keys {
        let table: String = row.get(0);
        let column: String = row.get(1);
        let references_table: String = row.get(2);
        let references_column: String = row.get(3);
        fk_by_table.entry(table).or_default().push(json!({
            "column": column,
            "referencesTable": references_table,
            "referencesColumn": references_column,
        }));
    }
    model_payload(
        Engine::Postgresql,
        database,
        by_table,
        fk_by_table,
        size_map,
    )
}

async fn introspect_mysql(uri: &str, database: &str) -> Result<Value, String> {
    let connection_uri = rewrite_database(uri, database)?;
    let pool = Pool::new(connection_uri.as_str());
    let mut conn = pool.get_conn().await.map_err(public_error)?;
    let columns: Vec<(String, String, String, String, u32)> = conn
        .exec_map(
            "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, ORDINAL_POSITION
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ?
             ORDER BY TABLE_NAME, ORDINAL_POSITION",
            (database,),
            |(table, name, sql_type, nullable, ordinal)| (table, name, sql_type, nullable, ordinal),
        )
        .await
        .map_err(public_error)?;
    let keys: Vec<(String, String, u32)> = conn
        .exec_map(
            "SELECT TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION
             FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = ? AND CONSTRAINT_NAME = 'PRIMARY'",
            (database,),
            |(table, name, ordinal)| (table, name, ordinal),
        )
        .await
        .map_err(public_error)?;
    let foreign_keys: Vec<(String, String, String, String)> = conn
        .exec_map(
            "SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
             FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL",
            (database,),
            |(table, column, ref_table, ref_column)| (table, column, ref_table, ref_column),
        )
        .await
        .map_err(public_error)?;
    let sizes: Vec<(String, Option<u64>)> = conn
        .exec_map(
            "SELECT TABLE_NAME, TABLE_ROWS
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
            (database,),
            |(table, rows)| (table, rows),
        )
        .await
        .map_err(public_error)?;
    drop(conn);
    pool.disconnect().await.map_err(public_error)?;

    let mut pk = std::collections::HashMap::new();
    for (table, name, ordinal) in &keys {
        pk.insert(format!("{table}.{name}"), *ordinal as i32);
    }
    let mut size_map = std::collections::HashMap::new();
    for (table, rows) in &sizes {
        size_map.insert(table.clone(), rows.unwrap_or(0) as i64);
    }
    let mut by_table: std::collections::BTreeMap<String, Vec<Value>> = std::collections::BTreeMap::new();
    for (table, name, sql_type, nullable, ordinal) in &columns {
        let key = format!("{table}.{name}");
        let is_pk = pk.contains_key(&key);
        by_table.entry(table.clone()).or_default().push(json!({
            "name": name,
            "sqlType": sql_type,
            "bsonType": sql_to_bson(sql_type),
            "nullable": nullable == "YES" && !is_pk,
            "isPrimaryKey": is_pk,
            "ordinal": ordinal,
            "pkOrdinal": pk.get(&key).copied().unwrap_or(0),
        }));
    }
    let mut fk_by_table: std::collections::HashMap<String, Vec<Value>> = std::collections::HashMap::new();
    for (table, column, references_table, references_column) in &foreign_keys {
        fk_by_table.entry(table.clone()).or_default().push(json!({
            "column": column,
            "referencesTable": references_table,
            "referencesColumn": references_column,
        }));
    }
    model_payload(
        Engine::Mysql,
        database,
        by_table,
        fk_by_table,
        size_map,
    )
}

async fn introspect_mssql(uri: &str, database: &str) -> Result<Value, String> {
    let schema = schema_name(uri, Engine::Mssql);
    let (config, host, port) = mssql_config(uri, database)?;
    let tcp = TcpStream::connect((host.as_str(), port))
        .await
        .map_err(public_error)?;
    tcp.set_nodelay(true).map_err(public_error)?;
    let mut client = MssqlClient::connect(config, tcp.compat_write())
        .await
        .map_err(public_error)?;

    let columns = client
        .query(
            "SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, ORDINAL_POSITION
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_CATALOG = @P1 AND TABLE_SCHEMA = @P2
             ORDER BY TABLE_NAME, ORDINAL_POSITION",
            &[&database, &schema],
        )
        .await
        .map_err(public_error)?
        .into_first_result()
        .await
        .map_err(public_error)?;

    let keys = client
        .query(
            "SELECT kcu.TABLE_NAME, kcu.COLUMN_NAME, kcu.ORDINAL_POSITION
             FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
             JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
               ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
             WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_CATALOG = @P1 AND tc.TABLE_SCHEMA = @P2",
            &[&database, &schema],
        )
        .await
        .map_err(public_error)?
        .into_first_result()
        .await
        .map_err(public_error)?;

    let foreign_keys = client
        .query(
            "SELECT kcu.TABLE_NAME, kcu.COLUMN_NAME, ccu.TABLE_NAME, ccu.COLUMN_NAME
             FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
             JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
               ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
             JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu
               ON rc.UNIQUE_CONSTRAINT_NAME = ccu.CONSTRAINT_NAME
             WHERE kcu.TABLE_CATALOG = @P1 AND kcu.TABLE_SCHEMA = @P2",
            &[&database, &schema],
        )
        .await
        .map_err(public_error)?
        .into_first_result()
        .await
        .map_err(public_error)?;

    let sizes = client
        .query(
            "SELECT t.name, SUM(p.rows)
             FROM sys.tables t
             JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1)
             JOIN sys.schemas s ON t.schema_id = s.schema_id
             WHERE s.name = @P1
             GROUP BY t.name",
            &[&schema],
        )
        .await
        .map_err(public_error)?
        .into_first_result()
        .await
        .map_err(public_error)?;

    let mut pk = std::collections::HashMap::new();
    for row in &keys {
        let table = row.get::<&str, usize>(0).unwrap_or("");
        let column = row.get::<&str, usize>(1).unwrap_or("");
        let ordinal = row.get::<i32, usize>(2).unwrap_or(0);
        pk.insert(format!("{table}.{column}"), ordinal);
    }
    let mut size_map = std::collections::HashMap::new();
    for row in &sizes {
        let table = row.get::<&str, usize>(0).unwrap_or("").to_string();
        let count = row.get::<i64, usize>(1).unwrap_or(0);
        size_map.insert(table, count);
    }
    let mut by_table: std::collections::BTreeMap<String, Vec<Value>> = std::collections::BTreeMap::new();
    for row in &columns {
        let table = row.get::<&str, usize>(0).unwrap_or("").to_string();
        let name = row.get::<&str, usize>(1).unwrap_or("").to_string();
        let sql_type = row.get::<&str, usize>(2).unwrap_or("").to_string();
        let nullable = row.get::<&str, usize>(3).unwrap_or("").to_string();
        let ordinal = row.get::<i32, usize>(4).unwrap_or(0);
        let key = format!("{table}.{name}");
        let is_pk = pk.contains_key(&key);
        by_table.entry(table).or_default().push(json!({
            "name": name,
            "sqlType": sql_type,
            "bsonType": sql_to_bson(&sql_type),
            "nullable": nullable.eq_ignore_ascii_case("YES") && !is_pk,
            "isPrimaryKey": is_pk,
            "ordinal": ordinal,
            "pkOrdinal": pk.get(&key).copied().unwrap_or(0),
        }));
    }
    let mut fk_by_table: std::collections::HashMap<String, Vec<Value>> = std::collections::HashMap::new();
    for row in &foreign_keys {
        let table = row.get::<&str, usize>(0).unwrap_or("").to_string();
        fk_by_table.entry(table).or_default().push(json!({
            "column": row.get::<&str, usize>(1).unwrap_or(""),
            "referencesTable": row.get::<&str, usize>(2).unwrap_or(""),
            "referencesColumn": row.get::<&str, usize>(3).unwrap_or(""),
        }));
    }
    model_payload(
        Engine::Mssql,
        database,
        by_table,
        fk_by_table,
        size_map,
    )
}

async fn introspect_sqlite(uri: &str) -> Result<Value, String> {
    let path = sqlite_path(uri)?;
    let database = database_name(uri, None, Engine::Sqlite).unwrap_or_else(|_| path.clone());
    tokio::task::spawn_blocking(move || {
        let conn = SqliteConnection::open(&path).map_err(public_error)?;
        let mut table_stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            .map_err(public_error)?;
        let table_names: Vec<String> = table_stmt
            .query_map([], |row| row.get(0))
            .map_err(public_error)?
            .collect::<Result<_, _>>()
            .map_err(public_error)?;

        let mut by_table: std::collections::BTreeMap<String, Vec<Value>> = std::collections::BTreeMap::new();
        let mut size_map = std::collections::HashMap::new();
        for table in table_names {
            let pragma = format!("PRAGMA table_info({})", quote_ident(&table));
            let mut stmt = conn.prepare(&pragma).map_err(public_error)?;
            let columns: Vec<(i32, String, String, i32, i32)> = stmt
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(5)?)))
                .map_err(public_error)?
                .collect::<Result<_, _>>()
                .map_err(public_error)?;
            for (ordinal, name, sql_type, notnull, pk) in columns {
                let is_pk = pk > 0;
                by_table.entry(table.clone()).or_default().push(json!({
                    "name": name,
                    "sqlType": sql_type,
                    "bsonType": sql_to_bson(&sql_type),
                    "nullable": notnull == 0 && !is_pk,
                    "isPrimaryKey": is_pk,
                    "ordinal": ordinal + 1,
                    "pkOrdinal": pk,
                }));
            }
            let count: i64 = conn
                .query_row(&format!("SELECT COUNT(*) FROM {}", quote_ident(&table)), [], |row| row.get(0))
                .unwrap_or(0);
            size_map.insert(table, count);
        }
        model_payload(
            Engine::Sqlite,
            &database,
            by_table,
            std::collections::HashMap::new(),
            size_map,
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

fn model_payload(
    engine: Engine,
    database: &str,
    by_table: std::collections::BTreeMap<String, Vec<Value>>,
    fk_by_table: std::collections::HashMap<String, Vec<Value>>,
    size_map: std::collections::HashMap<String, i64>,
) -> Result<Value, String> {
    if by_table.is_empty() {
        return Err(format!("{} database has no tables to import.", engine.label()));
    }
    let mut tables = Vec::new();
    let mut relationships = Vec::new();
    for (name, mut columns) in by_table {
        columns.sort_by_key(|column| column["ordinal"].as_i64().unwrap_or(0));
        let mut primary_key: Vec<Value> = columns
            .iter()
            .filter(|column| column["isPrimaryKey"].as_bool().unwrap_or(false))
            .collect::<Vec<_>>()
            .into_iter()
            .map(|column| column.clone())
            .collect();
        primary_key.sort_by_key(|column| column["pkOrdinal"].as_i64().unwrap_or(0));
        let primary_key_names: Vec<String> = if primary_key.is_empty() {
            columns
                .first()
                .and_then(|column| column["name"].as_str().map(str::to_string))
                .into_iter()
                .collect()
        } else {
            primary_key
                .iter()
                .filter_map(|column| column["name"].as_str().map(str::to_string))
                .collect()
        };
        let foreign_keys = fk_by_table.get(&name).cloned().unwrap_or_default();
        for key in &foreign_keys {
            relationships.push(json!({
                "parentTable": key["referencesTable"],
                "childTable": name,
                "fkColumn": key["column"],
                "avgChildrenPerParent": 0,
                "maxChildrenPerParent": 0,
                "isBounded": false,
            }));
        }
        let clean_columns: Vec<Value> = columns
            .into_iter()
            .map(|mut column| {
                column.as_object_mut().map(|object| {
                    object.remove("ordinal");
                    object.remove("pkOrdinal");
                });
                column
            })
            .collect();
        tables.push(json!({
            "name": name,
            "columns": clean_columns,
            "primaryKey": primary_key_names,
            "foreignKeys": foreign_keys,
            "rowCount": size_map.get(&name).copied().unwrap_or(0),
        }));
    }
    Ok(json!({
        "model": {
            "source": format!("ddl:{}", engine.dialect()),
            "tables": tables,
            "relationships": relationships,
        },
        "ddl": format!("// Live {} database {}. Schema read from the catalog.\n", engine.label(), database),
        "dialect": engine.dialect(),
    }))
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
    let user = url::form_urlencoded::parse(url.username().as_bytes())
        .next()
        .map(|(key, _)| key.into_owned())
        .unwrap_or_else(|| url.username().to_string());
    let password = url.password().unwrap_or("").to_string();
    config.authentication(AuthMethod::sql_server(user, password));
    config.encryption(tiberius::EncryptionLevel::Required);
    config.trust_cert();
    Ok((config, host, port))
}

fn sql_to_bson(sql_type: &str) -> &'static str {
    let lower = sql_type.to_ascii_lowercase();
    if lower.contains("int") || lower.contains("serial") {
        "int"
    } else if lower.contains("bool") || lower.contains("bit") {
        "bool"
    } else if lower.contains("double") || lower.contains("float") || lower.contains("real") {
        "double"
    } else if lower.contains("decimal") || lower.contains("numeric") || lower.contains("money") {
        "decimal"
    } else if lower.contains("date") || lower.contains("time") {
        "date"
    } else if lower.contains("json") || lower.contains("xml") {
        "object"
    } else if lower.contains("blob") || lower.contains("binary") || lower.contains("bytea") {
        "binData"
    } else {
        "string"
    }
}

fn quote_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

pub fn public_error(error: impl ToString) -> String {
    let message = error.to_string();
    if message.contains("UnknownIssuer") || message.contains("invalid peer certificate") {
        return "Could not reach the studio because its TLS certificate is not trusted.".to_string();
    }
    if message.contains("/api/agent/") {
        return "Could not reach the studio.".to_string();
    }
    for scheme in ["mongodb://", "mongodb+srv://", "postgres://", "postgresql://", "mysql://", "mssql://", "sqlserver://"] {
        if message.contains(scheme) {
            return "Could not connect to the database.".to_string();
        }
    }
    message
}
