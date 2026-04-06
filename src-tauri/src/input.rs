use serde::Serialize;
use std::env;
use std::path::Path;

#[derive(Debug, Serialize)]
pub enum InputKind {
    Command,
    CommandLike,
    NaturalLanguage,
}

#[derive(Debug, Serialize)]
pub struct InputClassification {
    pub kind: InputKind,
    pub binary: Option<String>,
}

pub fn classify(input: &str) -> InputClassification {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return InputClassification {
            kind: InputKind::NaturalLanguage,
            binary: None,
        };
    }

    // Natural language takes priority over binary lookup
    if looks_like_natural_language(trimmed) {
        return InputClassification {
            kind: InputKind::NaturalLanguage,
            binary: None,
        };
    }

    let first_token = trimmed.split_whitespace().next().unwrap_or("");

    if binary_exists(first_token) {
        return InputClassification {
            kind: InputKind::Command,
            binary: Some(first_token.to_string()),
        };
    }

    if looks_like_command(trimmed) {
        return InputClassification {
            kind: InputKind::CommandLike,
            binary: Some(first_token.to_string()),
        };
    }

    InputClassification {
        kind: InputKind::NaturalLanguage,
        binary: None,
    }
}

fn binary_exists(name: &str) -> bool {
    // Absolute or relative path
    if name.contains('/') {
        return Path::new(name).exists();
    }

    // Shell builtins
    const BUILTINS: &[&str] = &[
        "cd", "echo", "export", "source", "alias", "unalias", "set", "unset",
        "type", "hash", "eval", "exec", "exit", "return", "shift", "trap",
        "wait", "read", "printf", "test", "true", "false", "pwd", "pushd",
        "popd", "dirs", "bg", "fg", "jobs", "kill", "umask", "ulimit",
    ];
    if BUILTINS.contains(&name) {
        return true;
    }

    // Search PATH
    if let Ok(path_var) = env::var("PATH") {
        for dir in path_var.split(':') {
            if Path::new(dir).join(name).exists() {
                return true;
            }
        }
    }

    false
}

fn looks_like_natural_language(input: &str) -> bool {
    let lower = input.to_lowercase();
    let first = lower.split_whitespace().next().unwrap_or("");

    // Starts with a question word followed by more words
    const QUESTION_WORDS: &[&str] = &[
        "what", "how", "why", "when", "where", "who", "which",
        "can", "could", "would", "should", "is", "are", "do",
        "does", "did", "will", "explain", "tell", "show", "help",
        "describe", "list",
    ];
    let word_count = input.split_whitespace().count();
    if word_count >= 2 && QUESTION_WORDS.contains(&first) {
        return true;
    }

    // Ends with ? (question)
    if input.trim_end().ends_with('?') && word_count >= 2 {
        return true;
    }

    false
}

fn looks_like_command(input: &str) -> bool {
    let has_flags = input.split_whitespace().any(|t| t.starts_with('-'));
    let has_pipe = input.contains(" | ");
    let has_redirect = input.contains(" > ") || input.contains(" >> ") || input.contains(" < ");
    let has_semicolon = input.contains(';');
    let has_ampersand = input.contains(" && ") || input.contains(" || ");
    let has_subshell = input.contains("$(") || input.contains('`');
    let has_env_var = input.contains('$');
    let has_glob = input.contains('*') || input.contains('?');

    has_flags || has_pipe || has_redirect || has_semicolon
        || has_ampersand || has_subshell || has_env_var || has_glob
}
