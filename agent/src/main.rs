mod schema;

use std::env;
use std::time::Duration;

use mongodb::bson::Document;
use mongodb::sync::Client;
use schema::{sample_limit, schema_payload, table_from_documents};
use serde_json::Value;

fn flag(name: &str) -> Option<String> {
    let mut args = env::args().skip(1);
    let pair = format!("--{name}=");
    while let Some(arg) = args.next() {
        if arg == format!("--{name}") {
            return args.next();
        }
        if let Some(value) = arg.strip_prefix(&pair) {
            return Some(value.to_string());
        }
    }
    None
}

fn database_name(uri: &str, explicit: Option<&str>) -> Result<String, String> {
    if let Some(name) = explicit.map(str::trim).filter(|name| !name.is_empty()) {
        return Ok(name.to_string());
    }
    let after_scheme = uri.split_once("://").ok_or("MongoDB URI is not valid.")?.1;
    let path = after_scheme.split_once('/').map(|(_, path)| path).unwrap_or("");
    let database = path.split('?').next().unwrap_or("").trim();
    if database.is_empty() {
        return Err("Database name is required.".to_string());
    }
    Ok(database.to_string())
}

/// Driver errors can echo the URI. The studio only needs a safe sentence.
fn public_error(error: &impl ToString) -> String {
    let message = error.to_string();
    if message.contains("mongodb://") || message.contains("mongodb+srv://") {
        return "Could not connect to MongoDB.".to_string();
    }
    message
}

fn sample_database(uri: &str, database: &str) -> Result<Vec<Value>, String> {
    if !uri.starts_with("mongodb://") && !uri.starts_with("mongodb+srv://") {
        return Err("This download reads MongoDB. Use mongodb:// or mongodb+srv://.".to_string());
    }
    let client = Client::with_uri_str(uri).map_err(|error| public_error(&error))?;
    let db = client.database(database);
    let names = db.list_collection_names().run().map_err(|error| public_error(&error))?;
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
            .map_err(|error| public_error(&error))?;
        let mut documents = Vec::new();
        for document in cursor {
            documents.push(document.map_err(|error| public_error(&error))?);
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
    Ok(tables)
}

fn post_json(url: &str, body: Value) -> Result<(), String> {
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(30)).build();
    let response = agent
        .post(url)
        .set("content-type", "application/json")
        .send_json(body)
        .map_err(|error| public_error(&error))?;
    if response.status() >= 400 {
        return Err(format!("Studio rejected the schema (HTTP {}).", response.status()));
    }
    Ok(())
}

fn main() {
    if env::args().any(|arg| arg == "--help" || arg == "-h") {
        println!("hvymetl-agent --token <token> --uri <mongodb-uri> [--database <name>] [--server <url>]");
        return;
    }
    let token = flag("token").unwrap_or_default();
    let uri = flag("uri").unwrap_or_default();
    let database_flag = flag("database");
    let server = flag("server").unwrap_or_else(|| "https://hvymetl.studio".to_string());
    if token.is_empty() || uri.is_empty() {
        eprintln!("hvymetl-agent --token <token> --uri <mongodb-uri> [--database <name>] [--server <url>]");
        std::process::exit(2);
    }
    let server = server.trim_end_matches('/').to_string();
    let outcome = database_name(&uri, database_flag.as_deref()).and_then(|database| {
        let next = ureq::get(&format!("{server}/api/agent/next?token={token}")).call();
        match next {
            Ok(response) if response.status() == 401 => Err("Agent session expired.".to_string()),
            Ok(_) => Ok(database),
            Err(ureq::Error::Status(401, _)) => Err("Agent session expired.".to_string()),
            Err(error) => Err(public_error(&error)),
        }
        .and_then(|database| {
            let tables = sample_database(&uri, &database)?;
            let mut payload = schema_payload(&database, tables);
            payload["token"] = serde_json::Value::String(token.clone());
            post_json(&format!("{server}/api/agent/result"), payload)?;
            Ok(())
        })
    });
    if let Err(error) = outcome {
        let _ = post_json(
            &format!("{server}/api/agent/result"),
            serde_json::json!({ "token": token, "error": error }),
        );
        eprintln!("{error}");
        std::process::exit(1);
    }
    println!("Schema sent to the studio.");
}
