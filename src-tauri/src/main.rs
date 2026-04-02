#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bootstrap;
mod logging;
mod manifest;
mod settings;
mod tray;
mod webview;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    bootstrap::run();
}

fn main() {
    run();
}
