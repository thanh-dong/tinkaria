use tauri::{
    menu::MenuBuilder,
    tray::TrayIconBuilder,
    AppHandle, Runtime,
};

pub const COMPANION_TRAY_ID: &str = "companion";
pub const OPEN_SETTINGS_MENU_ID: &str = "open-settings";
pub const EXIT_MENU_ID: &str = "exit";
pub const COMPANION_TOOLTIP: &str = "Tinkaria Companion";

pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if app.tray_by_id(COMPANION_TRAY_ID).is_some() {
        return Ok(());
    }

    let menu = MenuBuilder::new(app)
        .text(OPEN_SETTINGS_MENU_ID, "Open Settings")
        .separator()
        .text(EXIT_MENU_ID, "Exit")
        .build()?;

    let mut tray = TrayIconBuilder::with_id(COMPANION_TRAY_ID)
        .menu(&menu)
        .tooltip(COMPANION_TOOLTIP)
        .show_menu_on_left_click(true);

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    tray.build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::COMPANION_TOOLTIP;

    #[test]
    fn tray_tooltip_uses_tinkaria_branding() {
        assert_eq!(COMPANION_TOOLTIP, "Tinkaria Companion");
    }
}
