//! Kithfield on the desktop: a window onto the web app, which draws everything (the three panes,
//! the menu-bar or tray critter, the popover, notifications) through Tauri's JavaScript API.
//! This side only starts the plugins, keeps one copy of the app running, and keeps the app alive
//! in the menu bar or tray when its window is closed.

use tauri::{Manager, RunEvent, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        // A second launch (a link, the dock) brings the running app forward instead.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .on_window_event(|window, event| {
            // Closing the farm's window hides it: the critter stays in the menu bar or tray,
            // and its popover opens the window again. Quit from the critter's menu.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Kithfield");

    app.run(|handle, event| {
        // The dock icon (macOS) opens the window again once it was closed.
        if let RunEvent::Reopen { .. } = event {
            if let Some(window) = handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    });
}
