//! A separate audience window. The protocol has no speaker-note or private-control fields.
use crate::error::{ErrorKind, VaultError, VaultResult};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Default, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Frame {
    pub title: String,
    pub body: String,
    pub image: Option<String>,
    pub background: String,
    pub foreground: String,
    pub accent: String,
    pub blank: bool,
    pub strokes: Vec<Stroke>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Stroke {
    pub colour: String,
    pub width: f64,
    pub points: Vec<[f64; 2]>,
}
#[derive(Default)]
pub struct AudienceState(pub Mutex<Option<Frame>>);
fn error(message: &str) -> VaultError {
    VaultError::new(ErrorKind::Io, message)
}
fn colour(value: &str) -> bool {
    value.len() == 7 && value.starts_with('#') && value[1..].bytes().all(|c| c.is_ascii_hexdigit())
}
pub fn validate(frame: &Frame) -> VaultResult<()> {
    if frame.title.len() > 1000
        || frame.body.len() > 100_000
        || !colour(&frame.background)
        || !colour(&frame.foreground)
        || !colour(&frame.accent)
        || frame.strokes.len() > 2000
    {
        return Err(error("Invalid audience frame"));
    }
    if let Some(image) = &frame.image {
        if image.len() > 16 * 1024 * 1024
            || ![
                "data:image/png;base64,",
                "data:image/jpeg;base64,",
                "data:image/webp;base64,",
                "http://asset.localhost/",
                "https://asset.localhost/",
                "asset://localhost/",
            ]
            .iter()
            .any(|prefix| image.starts_with(prefix))
        {
            return Err(error("Only local slide images can be projected"));
        }
    }
    let mut points = 0;
    for stroke in &frame.strokes {
        points += stroke.points.len();
        if points > 100_000
            || !colour(&stroke.colour)
            || !stroke.width.is_finite()
            || stroke.width <= 0.0
            || stroke.width > 100.0
            || stroke
                .points
                .iter()
                .flatten()
                .any(|n| !n.is_finite() || n.abs() > 10_000.0)
        {
            return Err(error("Invalid audience annotations"));
        }
    }
    if frame.blank
        && (!frame.title.is_empty()
            || !frame.body.is_empty()
            || frame.image.is_some()
            || !frame.strokes.is_empty())
    {
        return Err(error(
            "A blank audience frame must not contain slide content",
        ));
    }
    Ok(())
}
#[derive(Serialize)]
pub struct DisplayInfo {
    index: usize,
    name: String,
}
#[cfg(desktop)]
pub fn monitors(app: &AppHandle) -> VaultResult<Vec<DisplayInfo>> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| error("The main window is unavailable"))?;
    Ok(window
        .available_monitors()
        .map_err(|e| error(&e.to_string()))?
        .iter()
        .enumerate()
        .map(|(index, monitor)| DisplayInfo {
            index,
            name: format!(
                "{} · {} × {}",
                monitor.name().map(|s| s.as_str()).unwrap_or("Display"),
                monitor.size().width,
                monitor.size().height
            ),
        })
        .collect())
}
#[cfg(not(desktop))]
pub fn monitors(_app: &AppHandle) -> VaultResult<Vec<DisplayInfo>> {
    Ok(Vec::new())
}

pub fn update(app: &AppHandle, frame: Frame) -> VaultResult<()> {
    validate(&frame)?;
    let state = app.state::<AudienceState>();
    *state
        .0
        .lock()
        .map_err(|_| error("Audience state unavailable"))? = Some(frame.clone());
    if let Some(window) = app.get_webview_window("audience") {
        window
            .emit("audience-frame", &frame)
            .map_err(|e| error(&e.to_string()))?;
    }
    Ok(())
}
#[cfg(desktop)]
pub fn open(app: &AppHandle, frame: Frame, monitor: usize) -> VaultResult<()> {
    update(app, frame)?;
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| error("Main window unavailable"))?;
    let displays = main
        .available_monitors()
        .map_err(|e| error(&e.to_string()))?;
    let screen = displays
        .get(monitor)
        .ok_or_else(|| error("Choose an available display"))?;
    let window = if let Some(window) = app.get_webview_window("audience") {
        window
    } else {
        tauri::WebviewWindowBuilder::new(
            app,
            "audience",
            tauri::WebviewUrl::App("audience.html".into()),
        )
        .title("BenchWork Audience")
        .inner_size(1280.0, 720.0)
        .visible(false)
        .build()
        .map_err(|e| error(&e.to_string()))?
    };
    window
        .set_position(*screen.position())
        .map_err(|e| error(&e.to_string()))?;
    window
        .set_fullscreen(true)
        .map_err(|e| error(&e.to_string()))?;
    window.show().map_err(|e| error(&e.to_string()))?;
    let _ = main.set_focus();
    Ok(())
}
#[cfg(not(desktop))]
pub fn open(_app: &AppHandle, _frame: Frame, _monitor: usize) -> VaultResult<()> {
    Err(error("Use the desktop app for a separate audience display"))
}
pub fn close(app: &AppHandle) -> VaultResult<()> {
    if let Some(window) = app.get_webview_window("audience") {
        window.destroy().map_err(|e| error(&e.to_string()))?;
    }
    *app.state::<AudienceState>()
        .0
        .lock()
        .map_err(|_| error("Audience state unavailable"))? = None;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_private_fields_remote_images_and_content_in_blackout() {
        let mut frame = Frame {
            title: "Public".into(),
            background: "#102030".into(),
            foreground: "#ffffff".into(),
            accent: "#ff00aa".into(),
            ..Frame::default()
        };
        validate(&frame).unwrap();
        let mut json = serde_json::to_value(&frame).unwrap();
        json["notes"] = "Secret".into();
        assert!(serde_json::from_value::<Frame>(json).is_err());
        frame.image = Some("https://tracker.invalid/image.png".into());
        assert!(validate(&frame).is_err());
        frame.image = None;
        frame.blank = true;
        assert!(validate(&frame).is_err());
        frame.title.clear();
        validate(&frame).unwrap();
    }
}
