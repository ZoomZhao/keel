use keel_extension_sdk::{serve, ExtensionHandlers, RpcResult};
use keel_protocol::{
    CommandRunParams, CommandRunResult, InitializeParams, InitializeResult, SearchItem,
    SearchQueryParams, SearchQueryResult,
};

struct HelloWorld;

impl ExtensionHandlers for HelloWorld {
    fn initialize(&self, params: InitializeParams) -> RpcResult<InitializeResult> {
        Ok(InitializeResult {
            ready: true,
            message: Some(format!("{} is ready", params.extension.name)),
        })
    }

    fn search_query(&self, params: SearchQueryParams) -> RpcResult<SearchQueryResult> {
        let limit = params.limit.unwrap_or(5.0) as usize;
        let mut items = vec![
            SearchItem {
                id: "hello-rust".to_string(),
                title: format!("Hello from Rust: {}", params.query),
                subtitle: Some("Rust extension response".to_string()),
                score: Some(1.0),
                actions: None,
            },
            SearchItem {
                id: "portable-core".to_string(),
                title: "Move heavy capabilities into Rust".to_string(),
                subtitle: Some(
                    "Indexing, parsing, search, sync, and local AI fit here".to_string(),
                ),
                score: Some(0.8),
                actions: None,
            },
        ];
        items.truncate(limit);
        Ok(SearchQueryResult { items })
    }

    fn command_run(&self, params: CommandRunParams) -> RpcResult<CommandRunResult> {
        Ok(CommandRunResult {
            ok: true,
            message: Some(format!("Command {} completed", params.command_id)),
            toast: None,
            actions: None,
        })
    }
}

fn main() {
    serve(HelloWorld);
}
