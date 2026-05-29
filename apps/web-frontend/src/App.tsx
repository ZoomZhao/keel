import {
  Command,
  Bell,
  Info,
  Keyboard,
  Layers,
  Play,
  RefreshCcw,
  Search,
  Server,
  Sparkles,
  type LucideIcon
} from "lucide-react";
import type { FormEvent, MouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserNativeBridge } from "../../../packages/native-bridge/src/index.mjs";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Extension = {
  id: string;
  name: string;
  version: string;
  kind: string;
  command: string;
  capabilities: string[];
  enabled?: boolean;
  optional?: boolean;
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

type Overview = {
  project: {
    name: string;
    version: string;
    license: string;
  };
  extensions: Extension[];
  optionalExtensions?: Extension[];
  webView: {
    windows: WindowConfig[];
    frontend: {
      devUrl: string;
      distDir: string;
    };
  };
  protocol: {
    methods: Array<{ name: string; params: string; result: string }>;
  };
  backend?: {
    extensions: Array<{
      id: string;
      warmed: boolean;
      running: boolean;
    }>;
  };
};

type SearchItem = {
  id: string;
  title: string;
  subtitle?: string;
  score?: number;
  extensionId?: string;
};

type SearchResponse = {
  extension: string;
  search: {
    items: SearchItem[];
  };
};

type Status = "loading" | "ready" | "running" | "failed";
type NativeResult = { ok?: boolean; reason?: string };

const emptyOverview: Overview = {
  project: { name: "Keel", version: "0.1.0", license: "Apache-2.0" },
  extensions: [],
  optionalExtensions: [],
  webView: { windows: [], frontend: { devUrl: "", distDir: "" } },
  protocol: { methods: [] }
};

export function App() {
  const bridge = useMemo(() => createBrowserNativeBridge(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [overview, setOverview] = useState<Overview>(emptyOverview);
  const [query, setQuery] = useState("keel");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [nativeStatus, setNativeStatus] = useState("web fallback");
  const [nativeProbe, setNativeProbe] = useState("bridge idle");

  useEffect(() => {
    void loadOverview();

    void bridge.ready({ surface: "launcher" });
    void bridge.registerGlobalHotkey({
      id: "launcher.toggle",
      accelerator: "Command+Space",
      action: "window.focus"
    }).then((result: NativeResult) => {
      setNativeStatus(result.ok ? "hotkey ready" : result.reason ?? "native unavailable");
    });

    return bridge.onNativeEvent?.((event: { method?: string; payload?: { id?: string } }) => {
      if (event.method === "globalHotkey.pressed" && event.payload?.id === "launcher.toggle") {
        inputRef.current?.focus();
      }
    });
  }, [bridge]);

  const visibleResults = results.length > 0
    ? results
    : overview.extensions.map((extension) => ({
      id: extension.id,
      title: extension.name,
      subtitle: `${extension.kind} / ${extension.capabilities.join(", ")}`,
      score: extension.kind === "rust" ? 0.8 : 1,
      extensionId: extension.id
    }));

  const backendState = overview.backend?.extensions.some((extension) => extension.running)
    ? "warm"
    : "ready";
  const optionalIndexer = overview.optionalExtensions?.find((extension) => extension.id === "keel-file-indexer");

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
      setOverview(await getJson<Overview>("/api/overview"));
      setStatus("ready");
    } catch {
      setStatus("failed");
    }
  }

  async function showNativePopover(event: MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setNativeProbe("popover pending");
    const result = await bridge.showPopover({
      id: "keel.status",
      title: "Keel",
      message: `${overview.extensions.length} extensions, ${overview.protocol.methods.length} protocol methods`,
      anchorRect: toAnchorRect(rect)
    });
    recordNativeProbe("popover", result);
  }

  async function showNativeTooltip(event: MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setNativeProbe("tooltip pending");
    const result = await bridge.showTooltip({
      id: "keel.hotkey",
      text: "Command+Space",
      anchorRect: toAnchorRect(rect)
    });
    recordNativeProbe("tooltip", result);
  }

  async function showNativeToast() {
    setNativeProbe("toast pending");
    const result = await bridge.showToast({
      id: "keel.demo.toast",
      title: "Keel is ready",
      message: `${backendState === "warm" ? "Backend is warm" : "Backend is ready"} / ${overview.extensions.length} extensions`
    });
    recordNativeProbe("toast", result);
  }

  async function hideNativeOverlays() {
    setNativeProbe("hide pending");
    const [popover, tooltip, toast] = await Promise.all([
      bridge.hidePopover({ id: "keel.status" }),
      bridge.hideTooltip({ id: "keel.hotkey" }),
      bridge.hideToast({ id: "keel.demo.toast" })
    ]);
    recordNativeProbe("hide", popover.ok === false ? popover : tooltip.ok === false ? tooltip : toast);
  }

  function recordNativeProbe(name: string, result: NativeResult) {
    setNativeProbe(result.ok === false ? `${name}: ${result.reason ?? "unavailable"}` : `${name}: sent`);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background p-3 text-foreground">
      <section className="grid h-[min(560px,calc(100vh-24px))] w-full max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border bg-card shadow-2xl shadow-foreground/10">
        <header className="keel-topbar border-b bg-muted/55 p-3">
          <form className="grid grid-cols-[1fr_auto_auto] items-center gap-2" onSubmit={runSearch}>
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                aria-label="Command query"
                className="h-11 rounded-md bg-background pl-9 text-base shadow-inner"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Button className="h-11 px-3" type="submit">
              <Play className="h-4 w-4" />
              Run
            </Button>
            <Button aria-label="Refresh data" className="h-11 w-11" size="icon" type="button" variant="ghost" onClick={loadOverview}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </form>
        </header>

        <section className="min-h-0 overflow-auto p-2">
          <div className="grid gap-1.5">
            {visibleResults.map((item, index) => (
              <button
                className="group grid h-[68px] grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-transparent px-3 text-left transition-colors hover:border-border hover:bg-muted/45"
                key={item.id}
                type="button"
              >
                <div className="grid h-10 w-10 place-items-center rounded-md bg-accent text-accent-foreground">
                  {index === 0 ? <Command className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{item.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{item.subtitle ?? item.extensionId}</div>
                </div>
                <Badge variant="outline">{(item.score ?? 0).toFixed(1)}</Badge>
              </button>
            ))}
          </div>
        </section>

        <footer className="grid grid-cols-[1fr_auto] items-center gap-3 border-t bg-muted/45 px-3 py-2 text-xs text-muted-foreground max-sm:grid-cols-1">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <StatusPill icon={Server} label={`backend ${backendState}`} />
            <StatusPill icon={Keyboard} label={nativeStatus} />
            <StatusPill icon={Layers} label={optionalIndexer ? "file indexer optional" : "extensions only"} />
            <StatusPill icon={Info} label={nativeProbe} />
          </div>
          <div className="flex items-center justify-end gap-1.5 max-sm:justify-start">
            <Button className="h-8 px-2" type="button" variant="outline" onClick={showNativePopover}>
              <Info className="h-4 w-4" />
              Popover
            </Button>
            <Button className="h-8 px-2" type="button" variant="outline" onClick={showNativeTooltip}>
              <Keyboard className="h-4 w-4" />
              Tooltip
            </Button>
            <Button className="h-8 px-2" type="button" variant="outline" onClick={showNativeToast}>
              <Bell className="h-4 w-4" />
              Toast
            </Button>
            <Button aria-label="Hide native overlays" className="h-8 w-8" size="icon" type="button" variant="ghost" onClick={hideNativeOverlays}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
            <Badge variant={status === "failed" ? "warning" : status === "ready" ? "success" : "secondary"}>
              {statusLabel(status)}
            </Badge>
          </div>
        </footer>
      </section>
    </main>
  );
}

function StatusPill({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="truncate">{label}</span>
    </span>
  );
}

function statusLabel(status: Status) {
  if (status === "loading") return "Syncing";
  if (status === "running") return "Running";
  if (status === "failed") return "Needs attention";
  return "Ready";
}

function toAnchorRect(rect: DOMRect) {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  };
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}
