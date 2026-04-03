use serde::Deserialize;

pub const DEFAULT_COMPANION_MANIFEST_URL: &str = "http://127.0.0.1:5174/desktop-companion.json";

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopCompanionManifest {
    pub server_url: String,
    pub app_name: String,
    pub version: String,
    #[serde(default)]
    pub nats_url: Option<String>,
    #[serde(default)]
    pub nats_ws_url: Option<String>,
    #[serde(default)]
    pub auth_token: Option<String>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct AuthTokenResponse {
    token: String,
}

pub async fn fetch_desktop_companion_manifest() -> Result<DesktopCompanionManifest, String> {
    fetch_desktop_companion_manifest_from(DEFAULT_COMPANION_MANIFEST_URL).await
}

pub async fn fetch_desktop_companion_manifest_from(
    manifest_url: &str,
) -> Result<DesktopCompanionManifest, String> {
    let server_url = derive_server_url_from_manifest_url(manifest_url)?;
    let response = reqwest::get(manifest_url)
        .await
        .map_err(|error| format!("failed to fetch {manifest_url}: {error}"))?
        .error_for_status()
        .map_err(|error| format!("failed to fetch {manifest_url}: {error}"))?;

    let mut manifest = response
        .json::<DesktopCompanionManifest>()
        .await
        .map_err(|error| format!("failed to parse {manifest_url}: {error}"))?;

    manifest.server_url = server_url;
    Ok(manifest)
}

pub fn derive_server_url_from_manifest_url(manifest_url: &str) -> Result<String, String> {
    let mut url = reqwest::Url::parse(manifest_url)
        .map_err(|error| format!("invalid companion manifest url {manifest_url}: {error}"))?;
    url.set_path("");
    url.set_query(None);
    url.set_fragment(None);
    Ok(url.to_string().trim_end_matches('/').to_string())
}

pub fn derive_nats_ws_url(server_url: &str) -> Result<String, String> {
    let mut url = reqwest::Url::parse(server_url)
        .map_err(|error| format!("invalid companion server url {server_url}: {error}"))?;
    url.set_scheme(match url.scheme() {
        "https" => "wss",
        "http" => "ws",
        other => return Err(format!("unsupported companion server url scheme {other}")),
    })
        .map_err(|_| format!("failed to rewrite websocket scheme for {server_url}"))?;
    url.set_path("/nats-ws");
    url.set_query(None);
    url.set_fragment(None);
    Ok(url.to_string())
}

pub fn derive_auth_token_url(server_url: &str) -> Result<String, String> {
    let mut url = reqwest::Url::parse(server_url)
        .map_err(|error| format!("invalid companion server url {server_url}: {error}"))?;
    url.set_path("/auth/token");
    url.set_query(None);
    url.set_fragment(None);
    Ok(url.to_string())
}

pub fn resolve_legacy_nats_ws_url(manifest: &DesktopCompanionManifest) -> Option<String> {
    manifest
        .nats_ws_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

pub fn resolve_legacy_auth_token(manifest: &DesktopCompanionManifest) -> Option<String> {
    manifest
        .auth_token
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

pub async fn fetch_server_auth_token(server_url: &str) -> Result<String, String> {
    let auth_url = derive_auth_token_url(server_url)?;
    let response = reqwest::get(&auth_url)
        .await
        .map_err(|error| format!("failed to fetch {auth_url}: {error}"))?
        .error_for_status()
        .map_err(|error| format!("failed to fetch {auth_url}: {error}"))?;

    response
        .json::<AuthTokenResponse>()
        .await
        .map(|response| response.token)
        .map_err(|error| format!("failed to parse {auth_url}: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_desktop_companion_manifest_json() {
        let manifest = serde_json::from_str::<DesktopCompanionManifest>(
            r#"{
                "serverUrl": "http://127.0.0.1:5174",
                "natsUrl": "nats://127.0.0.1:4222",
                "natsWsUrl": "ws://127.0.0.1:4223",
                "authToken": "token",
                "appName": "Tinkaria",
                "version": "0.16.0"
            }"#,
        )
        .expect("manifest should parse");

        assert_eq!(manifest.server_url, "http://127.0.0.1:5174");
        assert_eq!(manifest.app_name, "Tinkaria");
        assert_eq!(manifest.version, "0.16.0");
        assert_eq!(manifest.nats_url.as_deref(), Some("nats://127.0.0.1:4222"));
        assert_eq!(manifest.nats_ws_url.as_deref(), Some("ws://127.0.0.1:4223"));
        assert_eq!(manifest.auth_token.as_deref(), Some("token"));
    }

    #[test]
    fn derives_websocket_url_from_server_url() {
        assert_eq!(
            derive_nats_ws_url("http://127.0.0.1:5175").expect("websocket url should derive"),
            "ws://127.0.0.1:5175/nats-ws"
        );
        assert_eq!(
            derive_nats_ws_url("https://tinkaria.example.com/base").expect("websocket url should derive"),
            "wss://tinkaria.example.com/nats-ws"
        );
    }

    #[test]
    fn derives_auth_token_url_from_server_url() {
        assert_eq!(
            derive_auth_token_url("http://127.0.0.1:5175").expect("auth token url should derive"),
            "http://127.0.0.1:5175/auth/token"
        );
    }

    #[test]
    fn derives_server_url_from_manifest_url() {
        assert_eq!(
            derive_server_url_from_manifest_url("http://127.0.0.1:5174/desktop-companion.json")
                .expect("server url should derive"),
            "http://127.0.0.1:5174"
        );
        assert_eq!(
            derive_server_url_from_manifest_url(
                "https://tinkaria.example.com/dev/desktop-companion.json?cache=1#bootstrap"
            )
            .expect("server url should derive"),
            "https://tinkaria.example.com"
        );
    }

    #[test]
    fn resolves_legacy_transport_fields_when_present() {
        let manifest = DesktopCompanionManifest {
            server_url: "http://127.0.0.1:5174".to_string(),
            app_name: "Tinkaria".to_string(),
            version: "1.0.0-rc".to_string(),
            nats_url: Some("nats://127.0.0.1:4222".to_string()),
            nats_ws_url: Some("ws://127.0.0.1:4333".to_string()),
            auth_token: Some("secret".to_string()),
        };

        assert_eq!(
            resolve_legacy_nats_ws_url(&manifest).as_deref(),
            Some("ws://127.0.0.1:4333")
        );
        assert_eq!(
            resolve_legacy_auth_token(&manifest).as_deref(),
            Some("secret")
        );
    }
}
