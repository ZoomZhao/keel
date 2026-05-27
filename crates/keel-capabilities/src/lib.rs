#![forbid(unsafe_code)]

use std::collections::HashMap;

use keel_protocol::SearchItem;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CapabilityDescriptor {
    pub id: String,
    pub name: String,
    pub version: String,
    pub capabilities: Vec<String>,
}

#[derive(Default)]
pub struct CapabilityRegistry {
    entries: HashMap<String, CapabilityDescriptor>,
}

impl CapabilityRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&mut self, descriptor: CapabilityDescriptor) -> Option<CapabilityDescriptor> {
        self.entries.insert(descriptor.id.clone(), descriptor)
    }

    pub fn get(&self, id: &str) -> Option<&CapabilityDescriptor> {
        self.entries.get(id)
    }

    pub fn by_capability(&self, capability: &str) -> Vec<&CapabilityDescriptor> {
        self.entries
            .values()
            .filter(|entry| entry.capabilities.iter().any(|item| item == capability))
            .collect()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SearchDocument {
    pub id: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub body: String,
}

#[derive(Default)]
pub struct InMemorySearchIndex {
    documents: Vec<SearchDocument>,
}

impl InMemorySearchIndex {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add(&mut self, document: SearchDocument) {
        self.documents.push(document);
    }

    pub fn query(&self, query: &str, limit: usize) -> Vec<SearchItem> {
        let query = query.trim().to_lowercase();
        if query.is_empty() || limit == 0 {
            return Vec::new();
        }

        let mut matches: Vec<_> = self
            .documents
            .iter()
            .filter_map(|document| {
                let title = document.title.to_lowercase();
                let body = document.body.to_lowercase();
                let mut score = 0.0;

                if title == query {
                    score += 2.0;
                } else if title.contains(&query) {
                    score += 1.0;
                }
                if body.contains(&query) {
                    score += 0.5;
                }

                (score > 0.0).then(|| {
                    (
                        score,
                        SearchItem {
                            id: document.id.clone(),
                            title: document.title.clone(),
                            subtitle: document.subtitle.clone(),
                            score: Some(score),
                        },
                    )
                })
            })
            .collect();

        matches.sort_by(|left, right| {
            right
                .0
                .partial_cmp(&left.0)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        matches
            .into_iter()
            .take(limit)
            .map(|(_, item)| item)
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_returns_capabilities() {
        let mut registry = CapabilityRegistry::new();
        registry.register(CapabilityDescriptor {
            id: "local-search".to_string(),
            name: "Local Search".to_string(),
            version: "0.1.0".to_string(),
            capabilities: vec!["search".to_string(), "index".to_string()],
        });

        assert_eq!(registry.get("local-search").unwrap().name, "Local Search");
        assert_eq!(registry.by_capability("search").len(), 1);
        assert!(registry.by_capability("clipboard").is_empty());
    }

    #[test]
    fn search_index_ranks_title_matches() {
        let mut index = InMemorySearchIndex::new();
        index.add(SearchDocument {
            id: "1".to_string(),
            title: "Keel Architecture".to_string(),
            subtitle: None,
            body: "Protocol first runtime".to_string(),
        });
        index.add(SearchDocument {
            id: "2".to_string(),
            title: "Runtime".to_string(),
            subtitle: None,
            body: "Keel extensions use JSON Lines".to_string(),
        });

        let results = index.query("keel", 5);

        assert_eq!(results.len(), 2);
        assert_eq!(results[0].id, "1");
    }
}

