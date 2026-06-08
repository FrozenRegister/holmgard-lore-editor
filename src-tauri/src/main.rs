#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use keyring::Entry;
use std::fs;
use tauri::api::path::app_data_dir;

const SERVICE: &str = "holmgard-lore-editor";

// ── Keyring commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn keyring_set(account: String, value: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE, &account).map_err(|e| format!("Failed to initialize keyring entry for {}: {}", account, e))?;
    entry.set_password(&value).map_err(|e| format!("Failed to set password for {}: {}", account, e))
}

#[tauri::command]
fn keyring_get(account: String) -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE, &account).map_err(|e| format!("Failed to initialize keyring entry for {}: {}", account, e))?;
    match entry.get_password() {
        Ok(pw) => Ok(Some(pw)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to retrieve password for {}: {}", account, e)),
    }
}

#[tauri::command]
fn keyring_delete(account: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE, &account).map_err(|e| format!("Failed to initialize keyring entry for {}: {}", account, e))?;
    match entry.delete_password() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Failed to delete password for {}: {}", account, e)),
    }
}

// ── Filesystem commands ───────────────────────────────────────────────────────

fn app_base(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app_data_dir(&app.config()).ok_or_else(|| "No app data directory".to_string())
}

#[tauri::command]
fn fs_read(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let full = app_base(&app)?.join(&path);
    fs::read_to_string(&full).map_err(|e| format!("Failed to read {}: {}", full.display(), e))
}

#[tauri::command]
fn fs_write(app: tauri::AppHandle, path: String, content: String) -> Result<(), String> {
    let full = app_base(&app)?.join(&path);
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory {}: {}", parent.display(), e))?;
    }
    fs::write(&full, &content).map_err(|e| format!("Failed to write {}: {}", full.display(), e))
}

#[tauri::command]
fn fs_list(app: tauri::AppHandle, path: String) -> Result<Vec<String>, String> {
    let full = app_base(&app)?.join(&path);
    if !full.exists() {
        return Ok(vec![]);
    }
    if !full.is_dir() {
        return Err(format!("Path is not a directory: {}", full.display()));
    }
    fs::read_dir(&full)
        .map_err(|e| format!("Failed to list {}: {}", full.display(), e))?
        .map(|entry| {
            entry
                .map(|e| e.file_name().to_string_lossy().to_string())
                .map_err(|e| format!("Error reading entry: {}", e))
        })
        .collect()
}

#[tauri::command]
fn fs_delete(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let full = app_base(&app)?.join(&path);
    if full.is_file() {
        fs::remove_file(&full).map_err(|e| format!("Failed to delete file {}: {}", full.display(), e))?;
    } else if full.is_dir() {
        fs::remove_dir_all(&full).map_err(|e| format!("Failed to delete directory {}: {}", full.display(), e))?;
    }
    Ok(())
}

// ── Entry point ───────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            keyring_set,
            keyring_get,
            keyring_delete,
            fs_read,
            fs_write,
            fs_list,
            fs_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
