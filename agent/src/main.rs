mod catalog;
mod engine;
mod extract;
mod schema;

use std::env;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio_tungstenite::{connect_async, tungstenite::Message};

use catalog::{introspect, public_error};
use engine::{database_name, detect_engine, Engine, WAVE_A_ENGINES};
use extract::{extract_next_chunk, ExtractTable};

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

fn has_flag(name: &str) -> bool {
    env::args().any(|arg| arg == format!("--{name}"))
}

fn studio_ws_url(server: &str, token: &str) -> Result<String, String> {
    let trimmed = server.trim_end_matches('/');
    let ws = if let Some(rest) = trimmed.strip_prefix("https://") {
        format!("wss://{rest}")
    } else if let Some(rest) = trimmed.strip_prefix("http://") {
        format!("ws://{rest}")
    } else if trimmed.starts_with("wss://") || trimmed.starts_with("ws://") {
        trimmed.to_string()
    } else {
        return Err("Studio server must be an http(s) or ws(s) URL.".to_string());
    };
    Ok(format!("{ws}/api/agent/v2?token={token}"))
}

async fn run_ws(token: &str, uri: &str, database: &str, server: &str) -> Result<(), String> {
    let engine = detect_engine(uri)?;
    let database = database_name(uri, Some(database).filter(|name| !name.is_empty()), engine)?;
    let url = studio_ws_url(server, token)?;
    let (socket, _) = connect_async(&url).await.map_err(public_error)?;
    let (mut write, mut read) = socket.split();

    write
        .send(Message::Text(
            json!({
                "type": "hello",
                "protocol": 1,
                "agentVersion": env!("CARGO_PKG_VERSION"),
                "engines": WAVE_A_ENGINES,
            })
            .to_string()
            .into(),
        ))
        .await
        .map_err(public_error)?;

    let mut tables: Vec<ExtractTable> = Vec::new();
    let mut schema_sent = false;

    while let Some(frame) = read.next().await {
        let message = frame.map_err(public_error)?;
        let text = match message {
            Message::Text(text) => text.to_string(),
            Message::Ping(payload) => {
                write.send(Message::Pong(payload)).await.map_err(public_error)?;
                continue;
            }
            Message::Close(_) => break,
            _ => continue,
        };
        let payload: Value = serde_json::from_str(&text).map_err(|_| "Invalid studio message.".to_string())?;
        let message_type = payload.get("type").and_then(Value::as_str).unwrap_or("");
        match message_type {
            "welcome" => {}
            "ping" => {
                write
                    .send(Message::Text(json!({ "type": "pong" }).to_string().into()))
                    .await
                    .map_err(public_error)?;
            }
            "introspect" => {
                let schema = introspect(uri, &database, engine).await?;
                write
                    .send(Message::Text(
                        json!({
                            "type": "schema",
                            "model": schema["model"],
                            "ddl": schema["ddl"],
                            "dialect": schema["dialect"],
                        })
                        .to_string()
                        .into(),
                    ))
                    .await
                    .map_err(public_error)?;
                schema_sent = true;
            }
            "schema_ok" => {}
            "extract" => {
                let job_id = payload
                    .get("jobId")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let chunk_rows = payload.get("chunkRows").and_then(Value::as_u64).unwrap_or(500) as usize;
                tables = payload
                    .get("tables")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default()
                    .into_iter()
                    .filter_map(|table| {
                        let name = table.get("name")?.as_str()?.to_string();
                        let columns = table
                            .get("columns")?
                            .as_array()?
                            .iter()
                            .filter_map(|column| column.as_str().map(str::to_string))
                            .collect::<Vec<_>>();
                        let checkpoint = table
                            .get("checkpoint")
                            .and_then(Value::as_str)
                            .filter(|value| !value.is_empty())
                            .map(str::to_string);
                        Some(ExtractTable {
                            name,
                            columns,
                            checkpoint,
                        })
                    })
                    .collect();
                for table in &mut tables {
                    loop {
                        let chunk = extract_next_chunk(uri, &database, engine, table, chunk_rows).await?;
                        write
                            .send(Message::Text(
                                json!({
                                    "type": "extract_chunk",
                                    "jobId": job_id,
                                    "table": table.name,
                                    "checkpoint": chunk.checkpoint,
                                    "columns": table.columns,
                                    "rows": chunk.rows,
                                    "eof": chunk.eof,
                                })
                                .to_string()
                                .into(),
                            ))
                            .await
                            .map_err(public_error)?;
                        table.checkpoint = Some(chunk.checkpoint);
                        if chunk.eof {
                            break;
                        }
                    }
                }
                write
                    .send(Message::Text(json!({ "type": "bye" }).to_string().into()))
                    .await
                    .map_err(public_error)?;
                return Ok(());
            }
            "ack" | "extract_complete" | "cancel" => {}
            "error" => {
                let message = payload
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("Studio rejected the agent.")
                    .to_string();
                return Err(message);
            }
            _ => {}
        }
        if schema_sent && tables.is_empty() {
            // Schema-only session: wait briefly for extract, then exit on idle.
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    }
    if !schema_sent {
        return Err("Studio closed before schema transfer finished.".to_string());
    }
    Ok(())
}

fn run_http_legacy(token: &str, uri: &str, database_flag: Option<&str>, server: &str) -> Result<(), String> {
    let engine = detect_engine(uri)?;
    if engine != Engine::Mongodb {
        return Err("HTTP poll mode only supports MongoDB. Omit --http to use WebSocket for Wave A engines.".to_string());
    }
    let database = database_name(uri, database_flag, engine)?;
    let server = server.trim_end_matches('/');
    let next = ureq::get(&format!("{server}/api/agent/next?token={token}")).call();
    match next {
        Ok(response) if response.status() == 401 => return Err("Agent session expired.".to_string()),
        Ok(_) => {}
        Err(ureq::Error::Status(401, _)) => return Err("Agent session expired.".to_string()),
        Err(error) => return Err(public_error(error)),
    }
    let runtime = tokio::runtime::Runtime::new().map_err(|error| error.to_string())?;
    let schema = runtime.block_on(introspect(uri, &database, engine))?;
    let mut payload = schema;
    payload["token"] = Value::String(token.to_string());
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(30)).build();
    let response = agent
        .post(&format!("{server}/api/agent/result"))
        .set("content-type", "application/json")
        .send_json(&payload)
        .map_err(public_error)?;
    if response.status() >= 400 {
        return Err(format!("Studio rejected the schema (HTTP {}).", response.status()));
    }
    Ok(())
}

#[tokio::main]
async fn main() {
    if env::args().any(|arg| arg == "--help" || arg == "-h") {
        println!(
            "hvymetl-agent --token <token> --uri <uri> [--database <name>] [--server <url>] [--http]"
        );
        println!("Wave A engines: mongodb, postgresql, mysql, mssql/sqlserver, sqlite");
        return;
    }
    let token = flag("token").unwrap_or_default();
    let uri = flag("uri").unwrap_or_default();
    let database_flag = flag("database");
    let server = flag("server").unwrap_or_else(|| "https://hvymetl.studio".to_string());
    if token.is_empty() || uri.is_empty() {
        eprintln!(
            "hvymetl-agent --token <token> --uri <uri> [--database <name>] [--server <url>] [--http]"
        );
        std::process::exit(2);
    }

    let outcome = if has_flag("http") {
        run_http_legacy(&token, &uri, database_flag.as_deref(), &server)
    } else {
        run_ws(&token, &uri, database_flag.as_deref().unwrap_or(""), &server).await
    };

    if let Err(error) = outcome {
        if !error.starts_with("Could not reach the studio") && !has_flag("http") {
            // Best-effort: HTTP error path for WSS failures before connect is skipped.
        }
        eprintln!("{error}");
        std::process::exit(1);
    }
    println!("Schema sent to the studio.");
}
