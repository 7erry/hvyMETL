use url::Url;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Engine {
    Mongodb,
    Postgresql,
    Mysql,
    Mssql,
    Sqlite,
}

impl Engine {
    pub fn dialect(self) -> &'static str {
        match self {
            Engine::Mongodb => "mongodb-json",
            Engine::Postgresql => "postgresql",
            Engine::Mysql => "mysql",
            Engine::Mssql => "mssql",
            Engine::Sqlite => "sqlite",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Engine::Mongodb => "MongoDB",
            Engine::Postgresql => "PostgreSQL",
            Engine::Mysql => "MySQL",
            Engine::Mssql => "Microsoft SQL Server",
            Engine::Sqlite => "SQLite",
        }
    }
}

pub fn detect_engine(uri: &str) -> Result<Engine, String> {
    let trimmed = uri.trim();
    if trimmed.starts_with("mongodb://") || trimmed.starts_with("mongodb+srv://") {
        return Ok(Engine::Mongodb);
    }
    if trimmed.starts_with("postgres://") || trimmed.starts_with("postgresql://") {
        return Ok(Engine::Postgresql);
    }
    if trimmed.starts_with("mysql://") {
        return Ok(Engine::Mysql);
    }
    if trimmed.starts_with("mssql://") || trimmed.starts_with("sqlserver://") {
        return Ok(Engine::Mssql);
    }
    if trimmed.starts_with("sqlite://") || trimmed.ends_with(".db") || trimmed.ends_with(".sqlite") || trimmed.ends_with(".sqlite3") {
        return Ok(Engine::Sqlite);
    }
    // Bare filesystem path for SQLite.
    if !trimmed.contains("://") && (trimmed.starts_with('/') || trimmed.starts_with('.')) {
        return Ok(Engine::Sqlite);
    }
    Err("Unsupported URI. Use mongodb, postgresql, mysql, mssql/sqlserver, or sqlite.".to_string())
}

pub fn database_name(uri: &str, explicit: Option<&str>, engine: Engine) -> Result<String, String> {
    if let Some(name) = explicit.map(str::trim).filter(|name| !name.is_empty()) {
        return Ok(name.to_string());
    }
    match engine {
        Engine::Sqlite => Ok(sqlite_path(uri)?),
        Engine::Mongodb => {
            let after_scheme = uri.split_once("://").ok_or("MongoDB URI is not valid.")?.1;
            let path = after_scheme.split_once('/').map(|(_, path)| path).unwrap_or("");
            let database = path.split('?').next().unwrap_or("").trim();
            if database.is_empty() {
                return Err("Database name is required.".to_string());
            }
            Ok(database.to_string())
        }
        _ => {
            let url = Url::parse(uri).map_err(|_| "Database URI is not valid.".to_string())?;
            let database = url.path().trim_start_matches('/');
            let database = percent_decode(database);
            if database.is_empty() {
                return Err("Database name is required.".to_string());
            }
            Ok(database)
        }
    }
}

pub fn schema_name(uri: &str, engine: Engine) -> String {
    let Ok(url) = Url::parse(uri) else {
        return default_schema(engine, "");
    };
    if let Some(schema) = url.query_pairs().find(|(key, _)| key == "schema").map(|(_, value)| value.into_owned()) {
        if !schema.trim().is_empty() {
            return schema;
        }
    }
    default_schema(engine, url.username())
}

fn default_schema(engine: Engine, _username: &str) -> String {
    match engine {
        Engine::Postgresql => "public".to_string(),
        Engine::Mssql => "dbo".to_string(),
        Engine::Mysql | Engine::Sqlite | Engine::Mongodb => "public".to_string(),
    }
}

pub fn sqlite_path(uri: &str) -> Result<String, String> {
    let trimmed = uri.trim();
    if let Some(rest) = trimmed.strip_prefix("sqlite://") {
        let path = rest.trim_start_matches('/');
        if path.is_empty() {
            return Err("SQLite path is required.".to_string());
        }
        if trimmed.starts_with("sqlite:///") {
            return Ok(format!("/{}", path));
        }
        return Ok(path.to_string());
    }
    Ok(trimmed.to_string())
}

fn percent_decode(value: &str) -> String {
    Url::parse(&format!("http://localhost/{value}"))
        .ok()
        .map(|url| url.path().trim_start_matches('/').to_string())
        .unwrap_or_else(|| value.to_string())
}

pub const WAVE_A_ENGINES: &[&str] = &["mongodb", "postgresql", "mysql", "mssql", "sqlite"];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_wave_a_uris() {
        assert_eq!(detect_engine("mongodb://localhost/shop").unwrap(), Engine::Mongodb);
        assert_eq!(detect_engine("postgresql://localhost/shop").unwrap(), Engine::Postgresql);
        assert_eq!(detect_engine("mysql://localhost/shop").unwrap(), Engine::Mysql);
        assert_eq!(detect_engine("mssql://localhost/shop").unwrap(), Engine::Mssql);
        assert_eq!(detect_engine("sqlserver://localhost/shop").unwrap(), Engine::Mssql);
        assert_eq!(detect_engine("sqlite:///tmp/shop.db").unwrap(), Engine::Sqlite);
        assert_eq!(detect_engine("/tmp/shop.db").unwrap(), Engine::Sqlite);
        assert!(detect_engine("oracle://localhost/ORCL").is_err());
    }
}
