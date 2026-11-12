//! The desktop shell: a native window around the same single-file build the
//! browser plays. The game itself is untouched; these three commands are the
//! only things it asks the shell for (see src/ui/platform.ts).

use std::path::Path;

use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

/// Ask where to put a file the game made (a save, a share card, a block list)
/// and write it there. Returns false if the player closed the dialog.
#[tauri::command]
async fn save_file(app: AppHandle, name: String, bytes: Vec<u8>) -> Result<bool, String> {
    // Only ever suggest a bare file name, whatever the page passed in.
    let name = Path::new(&name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("breakwater.txt")
        .to_owned();
    let mut dialog = app.dialog().file().set_file_name(&name);
    if let Some(ext) = Path::new(&name).extension().and_then(|e| e.to_str()) {
        dialog = dialog.add_filter(ext.to_uppercase(), &[ext]);
    }
    if let Ok(downloads) = app.path().download_dir() {
        dialog = dialog.set_directory(downloads);
    }
    let Some(chosen) = dialog.blocking_save_file() else {
        return Ok(false);
    };
    let path = chosen.into_path().map_err(|e| e.to_string())?;
    std::fs::write(path, bytes).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
fn toggle_fullscreen(window: WebviewWindow) -> Result<(), String> {
    let on = window.is_fullscreen().map_err(|e| e.to_string())?;
    window.set_fullscreen(!on).map_err(|e| e.to_string())
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_file, toggle_fullscreen, quit])
        .run(tauri::generate_context!())
        .expect("error while running Breakwater");
}
