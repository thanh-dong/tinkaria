use serde::Deserialize;

pub const DEFAULT_COMPANION_MANIFEST_URL: &str = "http://127.0.0.1:5174/desktop-companion.json";

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopCompanionManifest {
    pub server_url: String,
    pub nats_url: String,
    pub nats_ws_url: String,
    pub auth_token: String,
    pub app_name: String,
    pub version: String,
}

pub async fn fetch_desktop_companion_manifest() -> Result<DesktopCompanionManifest, String> {
    fetch_desktop_companion_manifest_from(DEFAULT_COMPANION_MANIFEST_URL).await
}

pub async fn fetch_desktop_companion_manifest_from(
    manifest_url: &str,
) -> Result<DesktopCompanionManifest, String> {
    let response = reqwest::get(manifest_url)
        .await
        .map_err(|error| format!("failed to fetch {manifest_url}: {error}"))?
        .error_for_status()
        .map_err(|error| format!("failed to fetch {manifest_url}: {error}"))?;

    response
        .json::<DesktopCompanionManifest>()
        .await
        .map_err(|error| format!("failed to parse {manifest_url}: {error}"))
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
        assert_eq!(manifest.nats_url, "nats://127.0.0.1:4222");
        assert_eq!(manifest.nats_ws_url, "ws://127.0.0.1:4223");
        assert_eq!(manifest.auth_token, "token");
        assert_eq!(manifest.app_name, "Tinkaria");
        assert_eq!(manifest.version, "0.16.0");
    }
}
