use crate::config::AiConfig;
use crate::keychain;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize, Clone)]
pub struct AiStreamEvent {
    pub block_id: String,
    pub kind: String, // "delta", "done", "error"
    pub content: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

pub async fn stream_chat(
    app: AppHandle,
    block_id: String,
    messages: Vec<ChatMessage>,
    config: &AiConfig,
) -> Result<(), String> {
    let api_key = keychain::get_api_key(&config.provider)?
        .ok_or_else(|| format!("No API key configured for '{}'", config.provider))?;

    if config.provider == "anthropic" {
        stream_anthropic(app, block_id, messages, config, &api_key).await
    } else {
        stream_openai_compat(app, block_id, messages, config, &api_key).await
    }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible (OpenAI, Gemini, Ollama, LM Studio, Groq, Mistral, etc.)
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct OpenAiRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
}

#[derive(Deserialize)]
struct OpenAiStreamChunk {
    choices: Option<Vec<OpenAiChoice>>,
}

#[derive(Deserialize)]
struct OpenAiChoice {
    delta: Option<OpenAiDelta>,
}

#[derive(Deserialize)]
struct OpenAiDelta {
    content: Option<String>,
}

async fn stream_openai_compat(
    app: AppHandle,
    block_id: String,
    messages: Vec<ChatMessage>,
    config: &AiConfig,
    api_key: &str,
) -> Result<(), String> {
    let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));

    let body = OpenAiRequest {
        model: config.model.clone(),
        messages,
        stream: true,
    };

    let response = reqwest::Client::new()
        .post(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("API error {status}: {text}"));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {e}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim_end_matches('\r').to_string();
            buffer = buffer[line_end + 1..].to_string();

            if line.is_empty() || line.starts_with(':') {
                continue;
            }

            if let Some(data) = line.strip_prefix("data: ") {
                if data.trim() == "[DONE]" {
                    emit_event(&app, &block_id, "done", "");
                    return Ok(());
                }

                if let Ok(chunk) = serde_json::from_str::<OpenAiStreamChunk>(data) {
                    if let Some(choices) = chunk.choices {
                        for choice in choices {
                            if let Some(delta) = choice.delta {
                                if let Some(content) = delta.content {
                                    emit_event(&app, &block_id, "delta", &content);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    emit_event(&app, &block_id, "done", "");
    Ok(())
}

// ---------------------------------------------------------------------------
// Anthropic (Claude)
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    stream: bool,
}

#[derive(Deserialize)]
struct AnthropicStreamEvent {
    #[serde(rename = "type")]
    event_type: String,
    delta: Option<AnthropicDelta>,
}

#[derive(Deserialize)]
struct AnthropicDelta {
    #[serde(rename = "type")]
    delta_type: Option<String>,
    text: Option<String>,
}

async fn stream_anthropic(
    app: AppHandle,
    block_id: String,
    messages: Vec<ChatMessage>,
    config: &AiConfig,
    api_key: &str,
) -> Result<(), String> {
    let url = format!("{}/messages", config.base_url.trim_end_matches('/'));

    // Extract system message from the messages list
    let mut system: Option<String> = None;
    let user_messages: Vec<ChatMessage> = messages
        .into_iter()
        .filter(|m| {
            if m.role == "system" {
                system = Some(m.content.clone());
                false
            } else {
                true
            }
        })
        .collect();

    let body = AnthropicRequest {
        model: config.model.clone(),
        max_tokens: 4096,
        messages: user_messages,
        system,
        stream: true,
    };

    let response = reqwest::Client::new()
        .post(&url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("API error {status}: {text}"));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {e}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim_end_matches('\r').to_string();
            buffer = buffer[line_end + 1..].to_string();

            if line.is_empty() || line.starts_with(':') || line.starts_with("event:") {
                continue;
            }

            if let Some(data) = line.strip_prefix("data: ") {
                if let Ok(event) = serde_json::from_str::<AnthropicStreamEvent>(data) {
                    match event.event_type.as_str() {
                        "content_block_delta" => {
                            if let Some(delta) = event.delta {
                                if delta.delta_type.as_deref() == Some("text_delta") {
                                    if let Some(text) = delta.text {
                                        emit_event(&app, &block_id, "delta", &text);
                                    }
                                }
                            }
                        }
                        "message_stop" => {
                            emit_event(&app, &block_id, "done", "");
                            return Ok(());
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    emit_event(&app, &block_id, "done", "");
    Ok(())
}

// ---------------------------------------------------------------------------
// Model listing
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct ModelsResponse {
    data: Option<Vec<ModelEntry>>,
}

#[derive(Deserialize)]
struct ModelEntry {
    id: String,
}

// Anthropic models endpoint
#[derive(Deserialize)]
struct AnthropicModelsResponse {
    data: Option<Vec<AnthropicModelEntry>>,
}

#[derive(Deserialize)]
struct AnthropicModelEntry {
    id: String,
}

pub async fn list_models(base_url: &str, provider: &str, api_key: &str) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();

    let response = if provider == "anthropic" {
        let url = format!("{}/models", base_url.trim_end_matches('/'));
        client
            .get(&url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .send()
            .await
    } else {
        let url = format!("{}/models", base_url.trim_end_matches('/'));
        client
            .get(&url)
            .header("Authorization", format!("Bearer {api_key}"))
            .send()
            .await
    }
    .map_err(|e| format!("Request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("API error {status}: {text}"));
    }

    if provider == "anthropic" {
        let body: AnthropicModelsResponse = response.json().await.map_err(|e| format!("Parse error: {e}"))?;
        Ok(body.data.unwrap_or_default().into_iter().map(|m| m.id).collect())
    } else {
        let text = response.text().await.map_err(|e| format!("Read error: {e}"))?;
        let body: ModelsResponse = serde_json::from_str(&text)
            .map_err(|e| format!("Parse error: {e}. Response: {}", &text[..text.len().min(500)]))?;
        Ok(body.data.unwrap_or_default().into_iter().map(|m| {
            // Strip "models/" prefix (Gemini returns IDs like "models/gemini-2.5-flash")
            m.id.strip_prefix("models/").unwrap_or(&m.id).to_string()
        }).collect())
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn emit_event(app: &AppHandle, block_id: &str, kind: &str, content: &str) {
    let _ = app.emit(
        "ai-stream",
        AiStreamEvent {
            block_id: block_id.to_string(),
            kind: kind.to_string(),
            content: content.to_string(),
        },
    );
}
