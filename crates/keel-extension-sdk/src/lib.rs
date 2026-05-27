#![forbid(unsafe_code)]

use std::io::{self, BufRead, Write};

use keel_protocol::{
    CommandRunParams, CommandRunResult, InitializeParams, InitializeResult, SearchQueryParams,
    SearchQueryResult,
};
use serde::Deserialize;
use serde_json::{json, Value};

pub type RpcResult<T> = Result<T, RpcError>;

#[derive(Debug)]
pub struct RpcError {
    pub code: String,
    pub message: String,
}

impl RpcError {
    pub fn method_not_found(method: &str) -> Self {
        Self {
            code: "method_not_found".to_string(),
            message: format!("Unsupported method: {method}"),
        }
    }

    pub fn invalid_params(message: impl Into<String>) -> Self {
        Self {
            code: "invalid_params".to_string(),
            message: message.into(),
        }
    }
}

pub trait ExtensionHandlers {
    fn initialize(&self, params: InitializeParams) -> RpcResult<InitializeResult>;
    fn search_query(&self, params: SearchQueryParams) -> RpcResult<SearchQueryResult>;
    fn command_run(&self, params: CommandRunParams) -> RpcResult<CommandRunResult>;
}

#[derive(Deserialize)]
struct RpcRequest {
    id: String,
    method: String,
    params: Value,
}

pub fn serve(handlers: impl ExtensionHandlers) {
    let stdin = io::stdin();
    let mut stdout = io::stdout();

    for line in stdin.lock().lines() {
        let response = match line {
            Ok(line) => handle_line(&handlers, &line),
            Err(error) => json!({
                "id": "unknown",
                "error": { "code": "io_error", "message": error.to_string() }
            }),
        };

        let _ = writeln!(stdout, "{response}");
        let _ = stdout.flush();
    }
}

fn handle_line(handlers: &impl ExtensionHandlers, line: &str) -> Value {
    let request: RpcRequest = match serde_json::from_str(line) {
        Ok(request) => request,
        Err(error) => {
            return json!({
                "id": "unknown",
                "error": { "code": "invalid_json", "message": error.to_string() }
            });
        }
    };

    let result = match request.method.as_str() {
        "extension.initialize" => call(request.params, |params| handlers.initialize(params)),
        "search.query" => call(request.params, |params| handlers.search_query(params)),
        "command.run" => call(request.params, |params| handlers.command_run(params)),
        method => Err(RpcError::method_not_found(method)),
    };

    match result {
        Ok(result) => json!({ "id": request.id, "result": result }),
        Err(error) => json!({
            "id": request.id,
            "error": { "code": error.code, "message": error.message }
        }),
    }
}

fn call<T, R>(params: Value, handler: impl FnOnce(T) -> RpcResult<R>) -> RpcResult<Value>
where
    T: for<'de> Deserialize<'de>,
    R: serde::Serialize,
{
    let params = serde_json::from_value(params)
        .map_err(|error| RpcError::invalid_params(error.to_string()))?;
    let result = handler(params)?;
    serde_json::to_value(result).map_err(|error| RpcError {
        code: "serialization_error".to_string(),
        message: error.to_string(),
    })
}

