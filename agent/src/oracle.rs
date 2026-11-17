use std::collections::{BTreeMap, HashMap};

use oracle_rs::{Config, Connection, Row, Value as OracleValue};
use serde_json::{json, Value};
use url::Url;

use crate::catalog::public_error;
use crate::engine::{schema_name, Engine};
use crate::extract::{ExtractChunk, ExtractTable};

/// Accounts that hold Oracle's own catalog and built-in packages. Never copy these.
const ORACLE_MAINTAINED: &[&str] = &[
    "SYS",
    "SYSTEM",
    "CTXSYS",
    "MDSYS",
    "XDB",
    "OLAPSYS",
    "ORDSYS",
    "ORDDATA",
    "OUTLN",
    "DBSNMP",
    "APPQOSSYS",
    "WMSYS",
    "EXFSYS",
    "DVSYS",
    "DVF",
    "GSMADMIN_INTERNAL",
    "GSMCATUSER",
    "GSMUSER",
    "LBACSYS",
    "OJVMSYS",
    "AUDSYS",
    "DBSFWUSER",
    "SYSBACKUP",
    "SYSDG",
    "SYSKM",
    "SYSRAC",
    "XS$NULL",
    "GGSYS",
    "ANONYMOUS",
    "DIP",
    "ORACLE_OCM",
    "SI_INFORMTN_SCHEMA",
    "SPATIAL_CSW_ADMIN_USR",
    "SPATIAL_WFS_ADMIN_USR",
    "MDDATA",
    "SYS$UMF",
    "DGPDB_INT",
    "REMOTE_SCHEDULER_AGENT",
];

pub struct OracleCatalog {
    pub columns: BTreeMap<String, Vec<Value>>,
    pub foreign_keys: HashMap<String, Vec<Value>>,
    pub sizes: HashMap<String, i64>,
}

pub fn is_oracle_maintained(owner: &str) -> bool {
    ORACLE_MAINTAINED.iter().any(|name| name.eq_ignore_ascii_case(owner.trim()))
}

pub fn oracle_type_label(data_type: &str, char_len: Option<i64>, precision: Option<i64>, scale: Option<i64>) -> String {
    let base = data_type.trim().to_ascii_uppercase();
    match base.as_str() {
        "VARCHAR2" | "NVARCHAR2" | "CHAR" | "NCHAR" => match char_len {
            Some(len) if len > 0 => format!("{base}({len})"),
            _ => base,
        },
        "NUMBER" => match (precision, scale) {
            (Some(precision), Some(scale)) if scale != 0 => format!("NUMBER({precision},{scale})"),
            (Some(precision), _) => format!("NUMBER({precision})"),
            _ => "NUMBER".to_string(),
        },
        "TIMESTAMP" | "TIMESTAMP WITH TIME ZONE" | "TIMESTAMP WITH LOCAL TIME ZONE" => match scale {
            Some(scale) => format!("{base}({scale})"),
            None => base,
        },
        _ => base,
    }
}

pub async fn read_catalog(uri: &str) -> Result<OracleCatalog, String> {
    let owner = schema_name(uri, Engine::Oracle);
    if is_oracle_maintained(&owner) {
        return Err("Refusing to copy an Oracle-maintained account. Connect as the owner of the schema you want.".to_string());
    }
    let explicit_owner = Url::parse(uri)
        .ok()
        .and_then(|url| url.query_pairs().find(|(key, _)| key == "schema").map(|(_, value)| value.into_owned()))
        .is_some_and(|value| !value.trim().is_empty());
    let conn = connect(uri).await?;
    let (column_sql, key_sql, fk_sql, size_sql, params) = if explicit_owner {
        (
            "SELECT table_name, column_name, data_type, char_length, data_precision, data_scale, nullable, column_id
             FROM all_tab_columns
             WHERE owner = :1 AND column_id IS NOT NULL AND table_name NOT LIKE 'BIN$%'
             ORDER BY table_name, column_id",
            "SELECT cols.table_name, cols.column_name, cols.position
             FROM all_constraints cons
             JOIN all_cons_columns cols ON cols.owner = cons.owner AND cols.constraint_name = cons.constraint_name
             WHERE cons.owner = :1 AND cons.constraint_type = 'P'",
            "SELECT cons.table_name, cols.column_name, pref.table_name, refcols.column_name
             FROM all_constraints cons
             JOIN all_cons_columns cols ON cols.owner = cons.owner AND cols.constraint_name = cons.constraint_name
             JOIN all_constraints parent ON parent.owner = cons.r_owner AND parent.constraint_name = cons.r_constraint_name
             JOIN all_cons_columns refcols
               ON refcols.owner = parent.owner AND refcols.constraint_name = parent.constraint_name AND refcols.position = cols.position
             JOIN all_tables pref ON pref.owner = parent.owner AND pref.table_name = parent.table_name
             WHERE cons.owner = :1 AND cons.constraint_type = 'R'",
            "SELECT table_name, NVL(num_rows, 0)
             FROM all_tables
             WHERE owner = :1 AND nested = 'NO' AND table_name NOT LIKE 'BIN$%'",
            vec![OracleValue::String(owner)],
        )
    } else {
        (
            "SELECT table_name, column_name, data_type, char_length, data_precision, data_scale, nullable, column_id
             FROM user_tab_columns
             WHERE column_id IS NOT NULL AND table_name NOT LIKE 'BIN$%'
             ORDER BY table_name, column_id",
            "SELECT cols.table_name, cols.column_name, cols.position
             FROM user_constraints cons
             JOIN user_cons_columns cols ON cols.constraint_name = cons.constraint_name
             WHERE cons.constraint_type = 'P'",
            "SELECT cons.table_name, cols.column_name, parent.table_name, refcols.column_name
             FROM user_constraints cons
             JOIN user_cons_columns cols ON cols.constraint_name = cons.constraint_name
             JOIN user_constraints parent ON parent.constraint_name = cons.r_constraint_name
             JOIN user_cons_columns refcols
               ON refcols.constraint_name = parent.constraint_name AND refcols.position = cols.position
             WHERE cons.constraint_type = 'R'",
            "SELECT table_name, NVL(num_rows, 0)
             FROM user_tables
             WHERE nested = 'NO' AND table_name NOT LIKE 'BIN$%'",
            Vec::new(),
        )
    };

    let column_rows = query_all(&conn, column_sql, &params).await?;
    let key_rows = query_all(&conn, key_sql, &params).await?;
    let fk_rows = query_all(&conn, fk_sql, &params).await?;
    let size_rows = query_all(&conn, size_sql, &params).await?;

    let mut primary_keys = HashMap::new();
    for row in &key_rows {
        let table = cell_text(row, 0);
        let column = cell_text(row, 1);
        let position = cell_i64(row, 2).unwrap_or(0);
        primary_keys.insert(format!("{table}.{column}"), position);
    }
    let mut columns = BTreeMap::new();
    for row in &column_rows {
        let table = cell_text(row, 0);
        let name = cell_text(row, 1);
        let data_type = cell_text(row, 2);
        let sql_type = oracle_type_label(&data_type, cell_i64(row, 3), cell_i64(row, 4), cell_i64(row, 5));
        let nullable = cell_text(row, 6).eq_ignore_ascii_case("Y");
        let ordinal = cell_i64(row, 7).unwrap_or(0);
        let pk_ordinal = primary_keys.get(&format!("{table}.{name}")).copied().unwrap_or(0);
        columns.entry(table).or_insert_with(Vec::new).push(json!({
            "name": name,
            "sqlType": sql_type,
            "bsonType": crate::catalog::sql_to_bson(&sql_type),
            "nullable": nullable && pk_ordinal == 0,
            "isPrimaryKey": pk_ordinal > 0,
            "ordinal": ordinal,
            "pkOrdinal": pk_ordinal,
        }));
    }
    let mut foreign_keys: HashMap<String, Vec<Value>> = HashMap::new();
    for row in &fk_rows {
        let table = cell_text(row, 0);
        foreign_keys.entry(table.clone()).or_default().push(json!({
            "column": cell_text(row, 1),
            "referencesTable": cell_text(row, 2),
            "referencesColumn": cell_text(row, 3),
        }));
    }
    let mut sizes = HashMap::new();
    for row in &size_rows {
        sizes.insert(cell_text(row, 0), cell_i64(row, 1).unwrap_or(0));
    }
    Ok(OracleCatalog {
        columns,
        foreign_keys,
        sizes,
    })
}

pub async fn extract_next(uri: &str, table: &ExtractTable, chunk_rows: usize) -> Result<ExtractChunk, String> {
    let owner = schema_name(uri, Engine::Oracle);
    if is_oracle_maintained(&owner) {
        return Err("Refusing to copy an Oracle-maintained account. Connect as the owner of the schema you want.".to_string());
    }
    let conn = connect(uri).await?;
    let explicit_owner = Url::parse(uri)
        .ok()
        .and_then(|url| url.query_pairs().find(|(key, _)| key == "schema").map(|(_, value)| value.into_owned()))
        .is_some_and(|value| !value.trim().is_empty());
    let pk_sql = if explicit_owner {
        "SELECT cols.column_name
         FROM all_constraints cons
         JOIN all_cons_columns cols ON cols.owner = cons.owner AND cols.constraint_name = cons.constraint_name
         WHERE cons.owner = :1 AND cons.table_name = :2 AND cons.constraint_type = 'P'
         ORDER BY cols.position"
    } else {
        "SELECT cols.column_name
         FROM user_constraints cons
         JOIN user_cons_columns cols ON cols.constraint_name = cons.constraint_name
         WHERE cons.table_name = :1 AND cons.constraint_type = 'P'
         ORDER BY cols.position"
    };
    let pk_params = if explicit_owner {
        vec![OracleValue::String(owner), OracleValue::String(table.name.clone())]
    } else {
        vec![OracleValue::String(table.name.clone())]
    };
    let pk_rows = query_all(&conn, pk_sql, &pk_params).await?;
    let pk: Vec<String> = pk_rows.iter().map(|row| cell_text(row, 0)).filter(|name| !name.is_empty()).collect();
    if pk.is_empty() || table.columns.is_empty() {
        return Ok(ExtractChunk {
            checkpoint: table.checkpoint.clone().unwrap_or_else(|| "0".to_string()),
            rows: Vec::new(),
            eof: true,
        });
    }

    let limit = chunk_rows.clamp(1, 5_000);
    let select_cols = table.columns.iter().map(|column| quote_ident(column)).collect::<Vec<_>>().join(", ");
    let pk_cols = pk.iter().map(|column| quote_ident(column)).collect::<Vec<_>>().join(", ");
    let from = if explicit_owner {
        format!("{}.{}", quote_ident(&schema_name(uri, Engine::Oracle)), quote_ident(&table.name))
    } else {
        quote_ident(&table.name)
    };
    let (sql, params) = match &table.checkpoint {
        Some(checkpoint) => {
            let values = decode_checkpoint(checkpoint)?;
            if values.len() != pk.len() {
                return Err("Checkpoint does not match primary key.".to_string());
            }
            let binds = (1..=pk.len()).map(|index| format!(":{index}")).collect::<Vec<_>>().join(", ");
            (
                format!("SELECT {select_cols} FROM {from} WHERE ({pk_cols}) > ({binds}) ORDER BY {pk_cols} FETCH FIRST {limit} ROWS ONLY"),
                values.into_iter().map(bind_value).collect(),
            )
        }
        None => (
            format!("SELECT {select_cols} FROM {from} ORDER BY {pk_cols} FETCH FIRST {limit} ROWS ONLY"),
            Vec::new(),
        ),
    };
    let rows = query_all(&conn, &sql, &params).await?;
    let mut out_rows = Vec::new();
    let mut last_pk = Vec::new();
    for row in &rows {
        let mut values = Vec::new();
        for index in 0..table.columns.len() {
            values.push(cell_json(row, index));
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
    let eof = out_rows.len() < limit;
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

async fn connect(uri: &str) -> Result<Connection, String> {
    let url = Url::parse(uri).map_err(|_| "Database URI is not valid.".to_string())?;
    let host = url.host_str().unwrap_or("localhost").to_string();
    let port = url.port().unwrap_or(1521);
    let service = url.path().trim_start_matches('/').to_string();
    let username = url.username().to_string();
    let password = url.password().unwrap_or("").to_string();
    if username.is_empty() {
        return Err("Oracle username is required.".to_string());
    }
    let sid = url
        .query_pairs()
        .find(|(key, _)| key == "sid")
        .map(|(_, value)| value.into_owned())
        .filter(|value| !value.trim().is_empty());
    let mut config = if let Some(sid) = sid.filter(|_| service.is_empty()) {
        Config::with_sid(host, port, sid, username, password)
    } else if service.is_empty() {
        return Err("Oracle service name or SID is required.".to_string());
    } else {
        Config::new(host, port, service, username, password)
    };
    let tls = url.query_pairs().any(|(key, value)| {
        (key == "sslmode" && !value.eq_ignore_ascii_case("disable")) || (key == "ssl" && value != "false")
    });
    if tls {
        config = config.with_tls().map_err(public_error)?;
    }
    Connection::connect_with_config(config).await.map_err(public_error)
}

async fn query_all(conn: &Connection, sql: &str, params: &[OracleValue]) -> Result<Vec<Row>, String> {
    let mut result = conn.query(sql, params).await.map_err(public_error)?;
    let mut rows = std::mem::take(&mut result.rows);
    while result.has_more_rows {
        let columns = result.columns.clone();
        result = conn.fetch_more(result.cursor_id, &columns, 200).await.map_err(public_error)?;
        rows.extend(std::mem::take(&mut result.rows));
    }
    Ok(rows)
}

fn cell_text(row: &Row, index: usize) -> String {
    match row.get(index) {
        Some(OracleValue::String(value)) => value.clone(),
        Some(OracleValue::Integer(value)) => value.to_string(),
        Some(OracleValue::Float(value)) => value.to_string(),
        Some(OracleValue::Number(value)) => value.as_str().to_string(),
        Some(OracleValue::Boolean(value)) => if *value { "Y" } else { "N" }.to_string(),
        _ => String::new(),
    }
}

fn cell_i64(row: &Row, index: usize) -> Option<i64> {
    row.get(index).and_then(OracleValue::as_i64)
}

fn cell_json(row: &Row, index: usize) -> Value {
    match row.get(index) {
        None | Some(OracleValue::Null) | Some(OracleValue::Lob(oracle_rs::LobValue::Null)) | Some(OracleValue::Lob(oracle_rs::LobValue::Empty)) => {
            Value::Null
        }
        Some(OracleValue::String(value)) => Value::String(value.clone()),
        Some(OracleValue::Integer(value)) => json!(value),
        Some(OracleValue::Float(value)) => json!(value),
        Some(OracleValue::Number(value)) => Value::String(value.as_str().to_string()),
        Some(OracleValue::Boolean(value)) => Value::Bool(*value),
        Some(OracleValue::Date(value)) => Value::String(format!(
            "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
            value.year, value.month, value.day, value.hour, value.minute, value.second
        )),
        Some(OracleValue::Timestamp(value)) => Value::String(format!(
            "{:04}-{:02}-{:02} {:02}:{:02}:{:02}.{:06}",
            value.year, value.month, value.day, value.hour, value.minute, value.second, value.microsecond
        )),
        Some(OracleValue::Bytes(value)) => Value::String(bytes_text(value)),
        Some(OracleValue::Lob(oracle_rs::LobValue::Inline(value))) => Value::String(bytes_text(value)),
        Some(OracleValue::Json(value)) => value.clone(),
        Some(OracleValue::RowId(value)) => value.to_string().map(Value::String).unwrap_or(Value::Null),
        // shortcut: locator LOBs, vectors, and collections stay null until a follow-up fetch exists
        _ => Value::Null,
    }
}

fn bytes_text(value: &[u8]) -> String {
    String::from_utf8(value.to_vec()).unwrap_or_else(|_| value.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn bind_value(value: String) -> OracleValue {
    if let Ok(number) = value.parse::<i64>() {
        OracleValue::Integer(number)
    } else {
        OracleValue::String(value)
    }
}

fn quote_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

fn encode_checkpoint(values: &[String]) -> String {
    values.join("\u{1f}")
}

fn decode_checkpoint(checkpoint: &str) -> Result<Vec<String>, String> {
    Ok(checkpoint.split('\u{1f}').map(str::to_string).collect())
}

fn json_cell_string(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(text) => text.clone(),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_oracle_maintained_accounts() {
        assert!(is_oracle_maintained("SYS"));
        assert!(is_oracle_maintained("system"));
        assert!(!is_oracle_maintained("HR"));
    }

    #[test]
    fn formats_user_column_types() {
        assert_eq!(oracle_type_label("VARCHAR2", Some(100), None, None), "VARCHAR2(100)");
        assert_eq!(oracle_type_label("NUMBER", None, Some(19), Some(0)), "NUMBER(19)");
        assert_eq!(oracle_type_label("NUMBER", None, Some(10), Some(2)), "NUMBER(10,2)");
        assert_eq!(oracle_type_label("DATE", None, None, None), "DATE");
    }
}
