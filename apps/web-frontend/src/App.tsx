import {
  AppWindow,
  Boxes,
  Braces,
  CheckCircle2,
  ChevronRight,
  Command,
  Cpu,
  Database,
  Gauge,
  Monitor,
  Play,
  RefreshCcw,
  Search,
  Server,
  ShipWheel,
  Sparkles,
  SquareTerminal,
  type LucideIcon
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

type Extension = {
  id: string;
  name: string;
  version: string;
  kind: string;
  command: string;
  capabilities: string[];
};

type WindowConfig = {
  id: string;
  title: string;
  kind: string;
  route?: string;
  size: {
    width: number;
    height: number;
    minWidth?: number;
    minHeight?: number;
  };
};

type ProtocolMethod = {
  name: string;
  params: string;
  result: string;
};

type Overview = {
  project: {
    name: string;
    version: string;
    license: string;
  };
  extensions: Extension[];
  webView: {
    windows: WindowConfig[];
    frontend: {
      devUrl: string;
      distDir: string;
    };
  };
  protocol: {
    records: string[];
    methods: ProtocolMethod[];
  };
  rust: {
    crates: string[];
    capabilities: string[];
  };
};

type SearchItem = {
  id: string;
  title: string;
  subtitle?: string;
  score?: number;
};

type SearchResponse = {
  extension: string;
  search: {
    items: SearchItem[];
  };
};

type Status = "loading" | "ready" | "running" | "failed";

const emptyOverview: Overview = {
  project: { name: "Keel", version: "0.1.0", license: "Apache-2.0" },
  extensions: [],
  webView: { windows: [], frontend: { devUrl: "", distDir: "" } },
  protocol: { records: [], methods: [] },
  rust: { crates: [], capabilities: [] }
};

export function App() {
  const [overview, setOverview] = useState<Overview>(emptyOverview);
  const [query, setQuery] = useState("keel");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [selection, setSelection] = useState("launcher");

  useEffect(() => {
    void loadOverview();
  }, []);

  const visibleResults = results.length > 0
    ? results
    : overview.extensions.map((extension) => ({
      id: extension.id,
      title: extension.name,
      subtitle: `${extension.kind} extension / ${extension.capabilities.join(", ")}`,
      score: extension.kind === "rust" ? 0.8 : 1
    }));

  const selectedWindow = overview.webView.windows.find((windowConfig) => windowConfig.id === selection)
    ?? overview.webView.windows[0];

  const sourceItems = useMemo(() => [
    { id: "launcher", label: "Launcher", value: overview.webView.windows.length, icon: AppWindow },
    { id: "extensions", label: "Extensions", value: overview.extensions.length, icon: Boxes },
    { id: "protocol", label: "Protocol", value: overview.protocol.methods.length, icon: Braces },
    { id: "runtime", label: "Runtime", value: overview.rust.crates.length, icon: Cpu }
  ], [overview]);

  async function loadOverview() {
    setStatus("loading");
    const data = await getJson<Overview>("/api/overview");
    setOverview(data);
    setStatus("ready");
  }

  async function runSearch(event?: FormEvent) {
    event?.preventDefault();
    setStatus("running");

    try {
      const response = await getJson<SearchResponse>(`/api/search?q=${encodeURIComponent(query || "keel")}`);
      setResults(response.search.items);
      setStatus("ready");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid h-screen min-h-[680px] grid-rows-[44px_minmax(0,1fr)] overflow-hidden max-lg:h-auto max-lg:min-h-screen">
        <header className="keel-topbar grid grid-cols-[220px_minmax(0,1fr)_320px] items-center border-b bg-muted/45 pe-3 max-xl:grid-cols-[210px_minmax(0,1fr)] max-lg:grid-cols-1 max-lg:gap-2 max-lg:py-2">
          <div className="flex items-center gap-2 px-1 text-sm font-semibold">
            <ShipWheel className="h-4 w-4 text-primary" />
            Keel
          </div>
          <form className="flex items-center gap-2" onSubmit={runSearch}>
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Command query"
                className="h-9 rounded-md bg-background pl-9 shadow-inner"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Button className="h-9" type="submit">
              <Play className="h-4 w-4" />
              Run
            </Button>
          </form>
          <div className="flex items-center justify-end gap-2 max-xl:hidden">
            <Badge variant={status === "failed" ? "warning" : status === "ready" ? "success" : "secondary"}>
              {statusLabel(status)}
            </Badge>
            <Button aria-label="Refresh data" size="icon" variant="ghost" onClick={loadOverview}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="grid min-h-0 grid-cols-[220px_minmax(0,1fr)_320px] max-xl:grid-cols-[210px_minmax(0,1fr)] max-lg:grid-cols-1">
          <aside className="grid min-h-0 content-start gap-4 border-r bg-muted/45 p-3 max-lg:border-b max-lg:border-r-0">
            <div className="px-2 py-1">
              <div className="text-[11px] font-bold uppercase text-muted-foreground">Sources</div>
            </div>

            <nav className="grid gap-1" aria-label="Sources">
              {sourceItems.map((item) => (
                <button
                  className={`flex h-9 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors ${
                    selection === item.id ? "bg-background shadow-sm" : "hover:bg-background/70"
                  }`}
                  key={item.id}
                  type="button"
                  onClick={() => setSelection(item.id)}
                >
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{item.value}</span>
                </button>
              ))}
            </nav>

            <Separator />

            <div className="grid gap-2 px-2 text-sm">
              <StatusRow icon={CheckCircle2} label="Host" value={statusLabel(status)} />
              <StatusRow icon={Server} label="Backend" value="Online" />
              <StatusRow icon={Database} label="Store" value={overview.project.version} />
            </div>
          </aside>

          <main className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto]">
            <section className="border-b p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-semibold tracking-normal">Command Center</h1>
                  <p className="text-sm text-muted-foreground">Run commands, inspect extensions, and verify local services.</p>
                </div>
                <Badge variant={status === "failed" ? "warning" : status === "ready" ? "success" : "secondary"}>
                  {statusLabel(status)}
                </Badge>
              </div>
            </section>

            <section className="grid grid-cols-4 border-b bg-muted/20 max-sm:grid-cols-2">
              <Metric label="Extensions" value={overview.extensions.length} />
              <Metric label="Methods" value={overview.protocol.methods.length} />
              <Metric label="Windows" value={overview.webView.windows.length} />
              <Metric label="Crates" value={overview.rust.crates.length} />
            </section>

            <section className="min-h-0 overflow-auto p-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <div className="text-[11px] font-bold uppercase text-muted-foreground">Results</div>
                <div className="text-xs text-muted-foreground">{visibleResults.length} items</div>
              </div>

              <div className="grid gap-1.5">
                {visibleResults.map((item, index) => (
                  <button
                    className="group grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-transparent bg-background px-3 py-2.5 text-left shadow-sm transition-colors hover:border-border hover:bg-muted/40"
                    key={item.id}
                    type="button"
                  >
                    <div className="grid h-8 w-8 place-items-center rounded-md bg-accent text-accent-foreground">
                      {index === 0 ? <Command className="h-4 w-4" /> : <SquareTerminal className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{item.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{item.subtitle}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{(item.score ?? 0).toFixed(1)}</Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <footer className="flex h-9 items-center justify-between border-t bg-muted/35 px-4 text-xs text-muted-foreground">
              <span>{overview.project.license}</span>
              <span>Local session</span>
            </footer>
          </main>

          <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-l bg-background max-xl:col-span-2 max-xl:border-l-0 max-xl:border-t max-lg:col-span-1">
            <div className="border-b p-4">
              <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">Inspector</div>
              <h2 className="text-lg font-semibold tracking-normal">{selectedWindow?.title ?? "Keel"}</h2>
              <p className="text-sm text-muted-foreground">{selectedWindow?.kind ?? "launcher"} window</p>
            </div>

            <div className="min-h-0 overflow-auto p-4">
              <InspectorSection title="Window">
                <InspectorRow icon={Monitor} label="Size" value={selectedWindow ? `${selectedWindow.size.width} x ${selectedWindow.size.height}` : "-"} />
                <InspectorRow icon={AppWindow} label="Route" value={selectedWindow?.route ?? "/"} />
                <InspectorRow icon={Gauge} label="Minimum" value={selectedWindow ? `${selectedWindow.size.minWidth ?? 0} x ${selectedWindow.size.minHeight ?? 0}` : "-"} />
              </InspectorSection>

              <InspectorSection title="Extensions">
                {overview.extensions.map((extension) => (
                  <InspectorRow icon={Boxes} key={extension.id} label={extension.name} value={extension.kind} />
                ))}
              </InspectorSection>

              <InspectorSection title="Protocol">
                {overview.protocol.methods.map((method) => (
                  <InspectorRow icon={Braces} key={method.name} label={method.name} value={method.result} />
                ))}
              </InspectorSection>

              <InspectorSection title="Runtime">
                {[...overview.rust.crates, ...overview.rust.capabilities].map((item, index) => (
                  <InspectorRow icon={index < overview.rust.crates.length ? Cpu : Sparkles} key={item} label={item} value={index < overview.rust.crates.length ? "crate" : "capability"} />
                ))}
              </InspectorSection>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-r px-4 py-3 last:border-r-0">
      <div className="text-[11px] font-bold uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function StatusRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 text-[11px] font-bold uppercase text-muted-foreground">{title}</div>
      <div className="overflow-hidden rounded-lg border bg-muted/20">{children}</div>
    </section>
  );
}

function InspectorRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 border-b px-3 py-2.5 text-sm last:border-b-0">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="min-w-0 truncate font-medium">{label}</span>
      <span className="max-w-32 truncate text-xs text-muted-foreground">{value}</span>
    </div>
  );
}

function statusLabel(status: Status) {
  if (status === "loading") return "Syncing";
  if (status === "running") return "Running";
  if (status === "failed") return "Needs attention";
  return "Ready";
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}
