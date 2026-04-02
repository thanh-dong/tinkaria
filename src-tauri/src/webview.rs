use tauri::{AppHandle, Error, Manager, WebviewUrl, WebviewWindowBuilder};

pub const CONTROLLED_WEBVIEW_TITLE: &str = "Tinkaria Companion View";

pub fn open_controlled_webview(app: &AppHandle, label: &str, target: &str) -> tauri::Result<()> {
    let url = target.parse().map_err(Error::InvalidUrl)?;

    if let Some(window) = app.get_webview_window(label) {
        window.navigate(url)?;
        window.show()?;
        window.set_focus()?;
        return Ok(());
    }

    WebviewWindowBuilder::new(app, label, WebviewUrl::External(url))
        .title(CONTROLLED_WEBVIEW_TITLE)
        .build()?;

    Ok(())
}

pub fn close_controlled_webview(app: &AppHandle, label: &str) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(label) {
        window.close()?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::CONTROLLED_WEBVIEW_TITLE;

    #[test]
    fn controlled_view_title_uses_tinkaria_branding() {
        assert_eq!(CONTROLLED_WEBVIEW_TITLE, "Tinkaria Companion View");
    }
}
