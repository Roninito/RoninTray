use tauri::{
    generate_handler, CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu,
    WindowEvent,
};

#[tauri::command]
async fn fetch_routes() -> Result<Vec<Route>, String> {
    let client = reqwest::Client::new();
    
    match client
        .get("http://localhost:17341/api/menubar-routes")
        .send()
        .await
    {
        Ok(response) => {
            match response.json::<RouteResponse>().await {
                Ok(data) => {
                    if let Some(routes) = data.menubar_routes.and_then(|mr| mr.effective_routes) {
                        Ok(routes)
                    } else {
                        Ok(vec![])
                    }
                }
                Err(e) => Err(format!("Failed to parse response: {}", e)),
            }
        }
        Err(e) => Err(format!("Failed to fetch routes: {}", e)),
    }
}

#[tauri::command]
async fn open_url(url: String) -> Result<(), String> {
    open::that(url).map_err(|e| format!("Failed to open URL: {}", e))
}

#[derive(serde::Deserialize, serde::Serialize, Clone, Debug)]
pub struct Route {
    pub path: String,
    pub title: Option<String>,
}

#[derive(serde::Deserialize)]
struct RouteResponse {
    menubar_routes: Option<MenubarRoutes>,
}

#[derive(serde::Deserialize)]
struct MenubarRoutes {
    effective_routes: Option<Vec<Route>>,
}

fn main() {
    let quit = CustomMenuItem::new("quit".to_string(), "Quit");
    let tray_menu = SystemTrayMenu::new()
        .add_item(quit);

    let system_tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| {
            match event {
                SystemTrayEvent::LeftClick { .. } => {
                    // Toggle the voice card like a menubar popover
                    if let Some(window) = app.get_window("main") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
                SystemTrayEvent::MenuItemClick { id, .. } => {
                    if id == "quit" {
                        std::process::exit(0);
                    }
                }
                _ => {}
            }
        })
        .on_window_event(|event| {
            // Popover behavior: dismiss the card when it loses focus
            if let WindowEvent::Focused(false) = event.event() {
                let _ = event.window().hide();
            }
        })
        .invoke_handler(generate_handler![fetch_routes, open_url])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
