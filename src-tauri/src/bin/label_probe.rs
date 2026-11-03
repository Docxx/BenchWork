//! Local manual transport diagnostic. Reads JSON requests; never prints by itself.
#[allow(dead_code, unused_imports)]
#[path = "../label_bluetooth.rs"]
mod label_bluetooth;
fn main() {
    #[cfg(windows)]
    {
        use std::io::{BufRead, Write};
        if let Some(id) = std::env::args().nth(1) {
            match label_bluetooth::connect(&id) {
                Ok(()) => println!("{{\"connected\":true}}"),
                Err(e) => {
                    println!("{}", serde_json::json!({"error":e}));
                    return;
                }
            }
            let _ = std::io::stdout().flush();
            for line in std::io::stdin().lock().lines() {
                let Ok(line) = line else { break };
                let result = (|| -> Result<serde_json::Value, String> {
                    let value: serde_json::Value =
                        serde_json::from_str(&line).map_err(|e| e.to_string())?;
                    match value["op"].as_str() {
                        Some("read") => Ok(serde_json::json!({"bytes":label_bluetooth::read()?})),
                        Some("write") => {
                            let data: Vec<u8> = serde_json::from_value(value["bytes"].clone())
                                .map_err(|e| e.to_string())?;
                            label_bluetooth::write(&data)?;
                            Ok(serde_json::json!({"ok":true}))
                        }
                        _ => Err("Unknown transport operation".into()),
                    }
                })();
                println!(
                    "{}",
                    result.unwrap_or_else(|e| serde_json::json!({"error":e}))
                );
                let _ = std::io::stdout().flush();
            }
            let _ = label_bluetooth::disconnect();
        } else {
            match label_bluetooth::scan() {
                Ok(devices) => println!("{}", serde_json::to_string_pretty(&devices).unwrap()),
                Err(e) => {
                    eprintln!("{e}");
                    std::process::exit(1);
                }
            }
        }
    }
}
