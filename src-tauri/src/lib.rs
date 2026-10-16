use std::net::TcpStream;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

static SERVER: Mutex<Option<Child>> = Mutex::new(None);

fn studio_port_open() -> bool {
    TcpStream::connect("127.0.0.1:3847").is_ok()
}

/// Start the existing Node studio when this shell is the one that should own it.
/// shortcut: an existing listener on 3847 is reused, upgrade when the shell binds its own port.
fn start_studio_server() {
    if studio_port_open() {
        return;
    }
    let root = concat!(env!("CARGO_MANIFEST_DIR"), "/..");
    let child = Command::new("node")
        .arg("dist/server/index.js")
        .current_dir(root)
        .env("HVYMETL_UI_PORT", "3847")
        .spawn()
        .expect("node is required to start the hvyMETL studio server");
    *SERVER.lock().expect("studio server lock") = Some(child);
    for _ in 0..50 {
        if studio_port_open() {
            return;
        }
        thread::sleep(Duration::from_millis(200));
    }
    panic!("hvyMETL studio did not listen on 127.0.0.1:3847");
}

fn stop_studio_server() {
    if let Some(child) = SERVER.lock().expect("studio server lock").as_mut() {
        let _ = child.kill();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    start_studio_server();
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the hvyMETL desktop shell")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                stop_studio_server();
            }
        });
}
