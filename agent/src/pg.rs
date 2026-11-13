use std::sync::Arc;
use std::time::Duration;

use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{ClientConfig, DigitallySignedStruct, Error, SignatureScheme};
use tokio_postgres::Client;
use tokio_postgres_rustls::MakeRustlsConnect;

const CONNECT_ATTEMPTS: u32 = 3;

/// Connect with rustls. Accepts any server cert (matches MSSQL `trust_cert()`).
///
/// Retries a few times when Kind/kubectl port-forward drops mid-handshake (`tls handshake eof`).
///
/// shortcut: no CA verify — fine for local/dev and self-signed PGO; add verify-full when shipping managed-cloud PG.
pub async fn connect(uri: &str) -> Result<Client, tokio_postgres::Error> {
    let uri = ensure_sslmode_require(uri);
    let mut last_err: Option<tokio_postgres::Error> = None;
    for attempt in 0..CONNECT_ATTEMPTS {
        match connect_once(&uri).await {
            Ok(client) => return Ok(client),
            Err(err) if is_handshake_eof(&err) && attempt + 1 < CONNECT_ATTEMPTS => {
                last_err = Some(err);
                tokio::time::sleep(Duration::from_millis(200 * u64::from(attempt + 1))).await;
            }
            Err(err) => return Err(err),
        }
    }
    Err(last_err.expect("handshake eof retry left an error"))
}

async fn connect_once(uri: &str) -> Result<Client, tokio_postgres::Error> {
    let mut config = ClientConfig::builder()
        .with_root_certificates(rustls::RootCertStore::empty())
        .with_no_client_auth();
    config
        .dangerous()
        .set_certificate_verifier(Arc::new(TrustAnyCert));
    let tls = MakeRustlsConnect::new(config);
    let (client, connection) = tokio_postgres::connect(uri, tls).await?;
    tokio::spawn(async move {
        let _ = connection.await;
    });
    Ok(client)
}

fn ensure_sslmode_require(uri: &str) -> String {
    if uri.contains("sslmode=") {
        return uri.to_string();
    }
    if uri.contains('?') {
        format!("{uri}&sslmode=require")
    } else {
        format!("{uri}?sslmode=require")
    }
}

fn is_handshake_eof(err: &tokio_postgres::Error) -> bool {
    let debug = format!("{err:?}");
    debug.contains("tls handshake eof") || debug.contains("UnexpectedEof")
}

#[derive(Debug)]
struct TrustAnyCert;

impl ServerCertVerifier for TrustAnyCert {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, Error> {
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        vec![
            SignatureScheme::ECDSA_NISTP256_SHA256,
            SignatureScheme::ECDSA_NISTP384_SHA384,
            SignatureScheme::ED25519,
            SignatureScheme::RSA_PSS_SHA256,
            SignatureScheme::RSA_PSS_SHA384,
            SignatureScheme::RSA_PSS_SHA512,
            SignatureScheme::RSA_PKCS1_SHA256,
            SignatureScheme::RSA_PKCS1_SHA384,
            SignatureScheme::RSA_PKCS1_SHA512,
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::ensure_sslmode_require;

    #[test]
    fn adds_sslmode_require_when_missing() {
        assert_eq!(
            ensure_sslmode_require("postgresql://u@127.0.0.1:5432/db"),
            "postgresql://u@127.0.0.1:5432/db?sslmode=require"
        );
        assert_eq!(
            ensure_sslmode_require("postgresql://u@127.0.0.1:5432/db?connect_timeout=5"),
            "postgresql://u@127.0.0.1:5432/db?connect_timeout=5&sslmode=require"
        );
    }

    #[test]
    fn leaves_existing_sslmode() {
        assert_eq!(
            ensure_sslmode_require("postgresql://u@127.0.0.1:5432/db?sslmode=prefer"),
            "postgresql://u@127.0.0.1:5432/db?sslmode=prefer"
        );
    }
}
