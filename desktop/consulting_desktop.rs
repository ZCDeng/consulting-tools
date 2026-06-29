use std::{
    fs::File,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::Duration,
};

use tauri::{AppHandle, Manager};

pub struct ConsultingToolkitServer {
    child: Mutex<Option<Child>>,
}

impl Drop for ConsultingToolkitServer {
    fn drop(&mut self) {
        self.stop();
    }
}

pub fn start(app: &AppHandle) -> tauri::Result<()> {
    let resource_dir = app.path().resource_dir().map_err(|error| {
        tauri::Error::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Failed to resolve app resources: {error}"),
        ))
    })?;
    let toolkit_root = first_existing(
        &resource_dir,
        &["consulting-tools", "resources/consulting-tools"],
    )?;
    let node_bin = first_existing(&resource_dir, &["bin/node", "resources/bin/node"])?;
    let server_dir = toolkit_root.join("server");
    let app_data_dir = app.path().app_data_dir().map_err(|error| {
        tauri::Error::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Failed to resolve app data dir: {error}"),
        ))
    })?;
    std::fs::create_dir_all(&app_data_dir).map_err(tauri::Error::Io)?;

    let port = reserve_port()?;
    let token = random_token()?;
    let url = format!("http://127.0.0.1:{port}/index.html");
    let data_dir = app_data_dir.join("data");
    let browser_dir = server_dir.join("ms-playwright");

    // Keep the server's stdout/stderr so startup failures (EADDRINUSE, a
    // missing module, a DB error) leave a diagnosable trail instead of
    // vanishing into /dev/null.
    let log_path = app_data_dir.join("consulting-tools-server.log");
    let stdout_log = File::create(&log_path).map_err(tauri::Error::Io)?;
    let stderr_log = stdout_log.try_clone().map_err(tauri::Error::Io)?;

    let mut child = Command::new(&node_bin)
        .arg(server_dir.join("app.js"))
        .current_dir(&server_dir)
        .env_clear()
        .env("HOME", app_data_dir.to_string_lossy().to_string())
        .env("PATH", "/usr/bin:/bin:/usr/sbin:/sbin")
        .env("TMPDIR", std::env::temp_dir())
        .env("TOOLKIT_ROOT_DIR", &toolkit_root)
        .env("TOOLKIT_DATA_DIR", &data_dir)
        .env("TOOLKIT_PORT", port.to_string())
        .env("TOOLKIT_HOST", "127.0.0.1")
        .env("TOOLKIT_TOKEN", &token)
        .env("PLAYWRIGHT_BROWSERS_PATH", &browser_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout_log))
        .stderr(Stdio::from(stderr_log))
        .spawn()
        .map_err(|error| {
            tauri::Error::Io(std::io::Error::new(
                error.kind(),
                format!("Failed to start bundled Consulting Tools server: {error}"),
            ))
        })?;

    // The reserved port is released before the child rebinds it, so a racing
    // process could occupy it. Requiring /token to echo back our private
    // token means a squatter that answers 200 is not trusted: we keep polling
    // and, on timeout, fail closed rather than loading a foreign origin.
    if let Err(error) = wait_for_server(port, &token) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(tauri::Error::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("{error}; see server log at {}", log_path.display()),
        )));
    }

    std::env::set_var("CONSULTING_TOOLS_DESKTOP_URL", url);
    app.manage(ConsultingToolkitServer {
        child: Mutex::new(Some(child)),
    });
    Ok(())
}

pub fn stop(app: &AppHandle) {
    if let Some(server) = app.try_state::<ConsultingToolkitServer>() {
        server.stop();
    }
}

impl ConsultingToolkitServer {
    fn stop(&self) {
        if let Ok(mut child) = self.child.lock() {
            if let Some(mut child) = child.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

fn first_existing(resource_dir: &PathBuf, candidates: &[&str]) -> tauri::Result<PathBuf> {
    for candidate in candidates {
        let path = resource_dir.join(candidate);
        if path.exists() {
            return Ok(path);
        }
    }
    Err(tauri::Error::Io(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        format!(
            "Missing bundled resource; checked: {}",
            candidates
                .iter()
                .map(|candidate| resource_dir.join(candidate).display().to_string())
                .collect::<Vec<_>>()
                .join(", ")
        ),
    )))
}

fn reserve_port() -> tauri::Result<u16> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(tauri::Error::Io)?;
    let port = listener.local_addr().map_err(tauri::Error::Io)?.port();
    drop(listener);
    Ok(port)
}

fn random_token() -> tauri::Result<String> {
    let mut buf = [0u8; 24];
    File::open("/dev/urandom")
        .and_then(|mut file| file.read_exact(&mut buf))
        .map_err(tauri::Error::Io)?;
    Ok(buf.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn wait_for_server(port: u16, token: &str) -> tauri::Result<()> {
    let request =
        format!("GET /token HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    for _ in 0..120 {
        if let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) {
            // If setting the read timeout fails, skip this attempt rather than
            // risk an unbounded blocking read; the loop sleeps and retries.
            if stream
                .set_read_timeout(Some(Duration::from_millis(500)))
                .is_ok()
                && stream.write_all(request.as_bytes()).is_ok()
            {
                let mut response = String::new();
                if stream.read_to_string(&mut response).is_ok()
                    && response.starts_with("HTTP/1.1 200")
                    && response.contains(token)
                {
                    return Ok(());
                }
            }
        }
        // Sleep on every iteration, including a successful connect that did not
        // yet return our token, so a half-ready server cannot cause a tight spin.
        std::thread::sleep(Duration::from_millis(100));
    }

    Err(tauri::Error::Io(std::io::Error::new(
        std::io::ErrorKind::TimedOut,
        "Timed out waiting for bundled Consulting Tools server",
    )))
}
