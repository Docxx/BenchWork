//! Running the person's own programs, such as a Python script on a dataset.
//! Only on the computer; modules ask through `ctx.programs`. Output is
//! captured, up to a limit, and a run can be stopped. Vault paths among the
//! arguments are turned into full paths here, and must stay in the vault.

use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::error::{ErrorKind, VaultError, VaultResult};
use crate::path_guard;

/// Output kept from each of stdout and stderr; the rest is dropped.
const OUTPUT_LIMIT: usize = 1024 * 1024;

/// One argument: text as it is, or a vault path to pass as a full path.
#[derive(Deserialize, Debug)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
pub enum Arg {
    Text(String),
    Vault(String),
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RunResult {
    /// The exit code, or null if it was stopped or ended by a signal.
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub stopped: bool,
}

/// Reads all of a stream, keeping only the first OUTPUT_LIMIT bytes; the
/// text arrives once the stream closes.
fn drain(mut stream: impl Read + Send + 'static) -> mpsc::Receiver<String> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut kept = Vec::new();
        let mut buf = [0u8; 8192];
        while let Ok(n) = stream.read(&mut buf) {
            if n == 0 {
                break;
            }
            if kept.len() < OUTPUT_LIMIT {
                let room = OUTPUT_LIMIT - kept.len();
                kept.extend_from_slice(&buf[..n.min(room)]);
            }
        }
        let _ = tx.send(String::from_utf8_lossy(&kept).into_owned());
    });
    rx
}

/// Ends a program and everything it started, such as a script's helpers.
fn end(child: &mut std::process::Child) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .creation_flags(0x0800_0000)
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// Runs `program` with `args` in the vault folder `cwd`, until it ends or
/// `stop` is set.
pub fn run(
    root: &Path,
    program: &str,
    args: &[Arg],
    cwd: &str,
    stop: &Arc<AtomicBool>,
) -> VaultResult<RunResult> {
    if program.trim().is_empty() {
        return Err(VaultError::new(ErrorKind::InvalidPath, "No program to run"));
    }
    let full = |rel: &str| -> VaultResult<String> {
        Ok(path_guard::display_path(&path_guard::resolve(root, rel)?))
    };
    let mut command = Command::new(program);
    for arg in args {
        match arg {
            Arg::Text(t) => command.arg(t),
            Arg::Vault(p) => command.arg(full(p)?),
        };
    }
    command
        .current_dir(path_guard::resolve(root, cwd)?)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // No console window flashing up.
        command.creation_flags(0x0800_0000);
    }
    let mut child = command
        .spawn()
        .map_err(|e| VaultError::new(ErrorKind::Io, format!("Could not start {program}: {e}")))?;
    let out = child.stdout.take().map(drain);
    let err = child.stderr.take().map(drain);
    let mut stopped = false;
    let status = loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|e| VaultError::io("Cannot wait for the program", &e))?
        {
            break Some(status);
        }
        if stop.load(Ordering::SeqCst) {
            end(&mut child);
            stopped = true;
            break None;
        }
        thread::sleep(Duration::from_millis(100));
    };
    // Once stopped, output still held open by a leftover helper is not waited for.
    let collect = |rx: Option<mpsc::Receiver<String>>| -> String {
        rx.and_then(|r| {
            if stopped {
                r.recv_timeout(Duration::from_secs(1)).ok()
            } else {
                r.recv().ok()
            }
        })
        .unwrap_or_default()
    };
    Ok(RunResult {
        code: status.and_then(|s| s.code()),
        stdout: collect(out),
        stderr: collect(err),
        stopped,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn shell() -> (&'static str, Vec<Arg>) {
        if cfg!(windows) {
            ("cmd", vec![Arg::Text("/C".into())])
        } else {
            ("sh", vec![Arg::Text("-c".into())])
        }
    }

    #[test]
    fn runs_a_program_in_the_vault_with_vault_paths_made_full() {
        let dir = tempfile::tempdir().unwrap();
        let root = path_guard::canonical_root(dir.path()).unwrap();
        std::fs::create_dir_all(root.join("Data")).unwrap();
        let (program, mut args) = shell();
        let script = if cfg!(windows) {
            "echo hello& echo oops 1>&2& exit 3"
        } else {
            "echo hello; echo oops >&2; exit 3"
        };
        args.push(Arg::Text(script.into()));
        let stop = Arc::new(AtomicBool::new(false));
        let result = run(&root, program, &args, "Data", &stop).unwrap();
        assert_eq!(result.code, Some(3));
        assert!(result.stdout.contains("hello"));
        assert!(result.stderr.contains("oops"));
        assert!(!result.stopped);
    }

    #[test]
    fn refuses_vault_paths_that_leave_the_vault() {
        let dir = tempfile::tempdir().unwrap();
        let root = path_guard::canonical_root(dir.path()).unwrap();
        let (program, mut args) = shell();
        args.push(Arg::Vault("../outside".into()));
        let stop = Arc::new(AtomicBool::new(false));
        assert!(run(&root, program, &args, "", &stop).is_err());
    }

    #[test]
    fn stops_a_run_when_asked() {
        let dir = tempfile::tempdir().unwrap();
        let root = path_guard::canonical_root(dir.path()).unwrap();
        let (program, mut args) = shell();
        let wait = if cfg!(windows) {
            "ping -n 30 127.0.0.1 >NUL"
        } else {
            "sleep 30"
        };
        args.push(Arg::Text(wait.into()));
        let stop = Arc::new(AtomicBool::new(false));
        let flag = stop.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(300));
            flag.store(true, Ordering::SeqCst);
        });
        let result = run(&root, program, &args, "", &stop).unwrap();
        assert!(result.stopped);
    }
}
