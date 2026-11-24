pub mod commands;
pub mod credentials;
pub mod db;
pub mod kg;
pub mod models;
pub mod pipeline;
pub mod providers;
pub mod sidecars;
pub mod worker;
pub mod studio;

use tauri::Manager;

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::current_dir().unwrap().join("artifacts"));
            let db_path = app_data_dir.join("learningedge.db");
            let tools = sidecars::resolve_tools(None)?;
            let pool = tauri::async_runtime::block_on(db::init_db(&db_path))?;

            let _worker = tauri::async_runtime::spawn({
                let pool = pool.clone();
                let tools = tools.clone();
                async move {
                    if let Err(err) = worker::spawn_pipeline_worker(pool, tools).await {
                        tracing::error!("Pipeline worker task exited with error: {err}");
                    }
                }
            });
            app.manage(commands::AppState {
                pool,
                tools,
                data_dir: app_data_dir,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            studio::studio_verify, studio::hosted_key, studio::hosted_models, studio::agy_models, studio::antigravity_status, studio::concept_markdown, studio::open_concept_note, studio::studio_models, studio::studio_connect, studio::graph_chat,
            commands::open_provider_usage,
            commands::run_fixture_pipeline,
            commands::run_lecture_text,
            commands::retry_run_with_scene_plan,
            commands::get_run_artifacts,
            commands::list_runs,
            commands::list_presets,
            commands::save_preset,
            commands::get_windows_voices,
            commands::get_provider_capabilities,
            commands::store_provider_secret,
            commands::check_provider_secret,
            commands::search_sources_fts,
            commands::get_knowledge_graph,
            commands::merge_kg_concepts,
            commands::run_dreaming,
            commands::review_dream_suggestion,
        ])
        .run(tauri::generate_context!())
        .expect("error while running LearningEdge Tauri application");
}
