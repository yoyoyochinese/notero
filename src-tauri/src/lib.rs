use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{Emitter, Manager, RunEvent};

static QUITTING: AtomicBool = AtomicBool::new(false);

// Moves a file or folder to the OS trash (plugin-fs only supports permanent delete).
// The app only ever trashes vault items (papers/<ck>, notes/x.md, canvases/x.canvas,
// papers/<ck>/notes/x.md), so anything else is refused: a script injected into the
// webview can't trash arbitrary paths.
#[tauri::command]
fn move_to_trash(path: String) -> Result<(), String> {
    let p = Path::new(&path).canonicalize().map_err(|e| e.to_string())?;
    let parent = p.parent().and_then(|d| d.file_name()).and_then(|n| n.to_str());
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let in_scope = p.starts_with(&home) || p.starts_with("/Volumes");
    if !in_scope || !matches!(parent, Some("papers" | "notes" | "canvases")) {
        return Err(format!("forbidden path: {path}"));
    }
    trash::delete(&p).map_err(|e| e.to_string())
}

/// Called by the frontend once pending saves are flushed (see App.tsx).
#[tauri::command]
fn quit(app: tauri::AppHandle) {
    QUITTING.store(true, Ordering::SeqCst);
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![move_to_trash, quit])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Cmd+Q: let the webview flush unsaved edits first. If it doesn't answer in 3 s, quit anyway.
            if let RunEvent::ExitRequested { api, .. } = event {
                if QUITTING.load(Ordering::SeqCst) || app.webview_windows().is_empty() {
                    return;
                }
                api.prevent_exit();
                let _ = app.emit("quit-requested", ());
                let app = app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(3));
                    QUITTING.store(true, Ordering::SeqCst);
                    app.exit(0);
                });
            }
        });
}
