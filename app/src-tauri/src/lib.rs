use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

/// Launch the bundled Python engine as a sidecar and keep it alive for the
/// lifetime of the app. In dev (no bundled binary) the engine is started
/// separately via `./scripts/dev.sh` — see README.
fn spawn_engine(app: &tauri::AppHandle) {
    let sidecar = match app.shell().sidecar("studio-engine") {
        Ok(cmd) => cmd.args(["--http-port", "8765"]),
        Err(_) => return, // dev: engine started by the dev script
    };
    if let Ok((mut rx, _child)) = sidecar.spawn() {
        tauri::async_runtime::spawn(async move {
            while let Some(event) = rx.recv().await {
                if let CommandEvent::Stderr(line) | CommandEvent::Stdout(line) = event {
                    eprintln!("[engine] {}", String::from_utf8_lossy(&line));
                }
            }
        });
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            spawn_engine(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running RoboStore Studio");
}
