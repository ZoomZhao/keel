import {
  Boxes,
  Braces,
  Cable,
  Cpu,
  ExternalLink,
  Monitor,
  Play,
  RefreshCcw,
  Search,
  Server,
  Settings,
  ShipWheel,
  Sparkles
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
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
  const [status, setStatus] = useState<"loading" | "ready" | "running" | "failed">("loading");

  useEffect(() => {
    void loadOverview();
  }, []);

  const metrics = useMemo(() => [
    { label: "Extensions", value: overview.extensions.length, icon: Boxes },
    { label: "Protocol methods", value: overview.protocol.methods.length, icon: Braces },
    { label: "WebView windows", value: overview.webView.windows.length, icon: Monitor },
    { label: "Rust crates", value: overview.rust.crates.length, icon: Cpu }
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
    <div className="grid min-h-screen grid-cols-[280px_minmax(0,1fr)] max-lg:grid-cols-1">
      <aside className="flex flex-col gap-7 bg-foreground p-7 text-white">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg border border-white/15 bg-white/10">
            <ShipWheel className="h-5 w-5 text-emerald-200" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-normal">Keel</h1>
            <p className="text-sm text-white/60">{overview.project.version} / {overview.project.license}</p>
          </div>
        </div>

        <nav className="grid gap-1 text-sm" aria-label="Primary">
          {[
            ["Run", "#run", Play],
            ["Extensions", "#extensions", Boxes],
            ["Host", "#host", Monitor],
            ["Protocol", "#protocol", Braces]
          ].map(([label, href, Icon]) => (
            <a className="flex items-center gap-2 rounded-lg px-3 py-2 text-white/80 hover:bg-white/10 hover:text-white" href={href as string} key={label as string}>
              <Icon className="h-4 w-4" />
              {label as string}
            </a>
          ))}
        </nav>

        <div className="mt-auto rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
            Local foundation
          </div>
          <p className="mt-2 text-sm leading-5 text-white/60">React UI, Node backend, WebView config, Rust capability crates.</p>
        </div>
      </aside>

      <main className="grid content-start gap-5 p-7 max-sm:p-4">
        <header className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-stretch">
          <div>
            <p className="mb-1 text-xs font-bold uppercase text-primary">Developer console</p>
            <h2 className="text-3xl font-semibold tracking-normal max-sm:text-2xl">Build and validate a Keel extension host</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button aria-label="Refresh data" size="icon" variant="outline" onClick={loadOverview}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
            <Button asChild variant="outline">
              <a href="/api/overview" target="_blank" rel="noreferrer">
                JSON <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </header>

        <section className="grid grid-cols-4 gap-4 max-xl:grid-cols-2 max-sm:grid-cols-1" aria-label="Project status">
          {metrics.map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <strong className="mt-1 block text-3xl">{value}</strong>
                </div>
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-accent-foreground">
                  <Icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card id="run">
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardDescription>Run extension</CardDescription>
              <CardTitle>Search through the demo extension</CardTitle>
            </div>
            <Badge variant={status === "failed" ? "warning" : status === "ready" ? "success" : "secondary"}>{status}</Badge>
          </CardHeader>
          <CardContent className="grid gap-4">
            <form className="flex gap-2 max-sm:flex-col" onSubmit={runSearch}>
              <div className="relative w-full">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              <Button type="submit">
                <Play className="h-4 w-4" />
                Run
              </Button>
            </form>

            <div className="grid gap-2" aria-live="polite">
              {results.length === 0 ? (
                <div className="grid min-h-20 place-content-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">
                  Submit a query to call the JavaScript extension through the backend.
                </div>
              ) : results.map((item) => (
                <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/35 p-3" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <p className="text-sm text-muted-foreground">{item.subtitle}</p>
                  </div>
                  <Badge variant="outline">{(item.score ?? 0).toFixed(1)}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-5 max-xl:grid-cols-1">
          <Card id="extensions">
            <CardHeader>
              <CardDescription>Extensions</CardDescription>
              <CardTitle>Installed examples</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {overview.extensions.map((extension) => (
                <div className="rounded-lg border bg-muted/35 p-4" key={extension.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <strong>{extension.name}</strong>
                      <p className="text-sm text-muted-foreground">{extension.id} / {extension.kind}</p>
                    </div>
                    <Badge variant="outline">{extension.version}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {extension.capabilities.map((capability) => <Badge variant="secondary" key={capability}>{capability}</Badge>)}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card id="host">
            <CardHeader>
              <CardDescription>WebView host</CardDescription>
              <CardTitle>Runtime topology</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="keel-topology grid items-center gap-2">
                <TopologyNode icon={Settings} label="Native host" tone="blue" />
                <Cable className="mx-auto h-4 w-4 text-muted-foreground max-[720px]:rotate-90" />
                <TopologyNode icon={Monitor} label="WebView UI" tone="green" />
                <Cable className="mx-auto h-4 w-4 text-muted-foreground max-[720px]:rotate-90" />
                <TopologyNode icon={Server} label="Node backend" tone="amber" />
              </div>
              <Separator />
              <div className="grid gap-2">
                {overview.webView.windows.map((windowConfig) => (
                  <div className="flex justify-between rounded-lg border bg-muted/35 p-3 text-sm" key={windowConfig.id}>
                    <span className="font-medium">{windowConfig.title}</span>
                    <span className="text-muted-foreground">{windowConfig.kind} / {windowConfig.size.width}x{windowConfig.size.height}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card id="protocol">
            <CardHeader>
              <CardDescription>Protocol</CardDescription>
              <CardTitle>Generated RPC surface</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {overview.protocol.methods.map((method) => (
                <div className="rounded-lg border bg-muted/35 p-4" key={method.name}>
                  <strong>{method.name}</strong>
                  <p className="mt-1 text-sm text-muted-foreground">{method.params} to {method.result}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Rust core</CardDescription>
              <CardTitle>Capability base</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {[...overview.rust.crates, ...overview.rust.capabilities].map((item, index) => (
                <div className="flex items-center gap-3 rounded-lg border bg-muted/35 p-3" key={item}>
                  {index < overview.rust.crates.length ? <Cpu className="h-4 w-4 text-primary" /> : <Sparkles className="h-4 w-4 text-amber-600" />}
                  <span className="font-medium">{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function TopologyNode({ icon: Icon, label, tone }: { icon: typeof Monitor; label: string; tone: "blue" | "green" | "amber" }) {
  const toneClass = {
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800"
  }[tone];

  return (
    <div className={`grid min-h-16 place-items-center gap-1 rounded-lg border p-3 text-center text-sm font-semibold ${toneClass}`}>
      <Icon className="h-4 w-4" />
      {label}
    </div>
  );
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

