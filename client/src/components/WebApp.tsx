// client/src/components/WebApp.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

/* ============================ STYLES ============================ */
const sx: Record<string, React.CSSProperties> = {
  app: {
    display: "grid",
    gridTemplateRows: "72px 1fr 72px",
    height: "100vh",
    background: "#f7fafc",
    color: "#102a43",
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  },
  header: {
    display: "grid",
    alignContent: "center",
    justifyContent: "center",
    borderBottom: "1px solid #e6eaf0",
    background: "#fff",
  },
  h1: { margin: 0, fontWeight: 800, fontSize: 28, letterSpacing: 0.2 },
  content: { padding: 16, overflow: "auto" },

  tabbar: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    borderTop: "1px solid #e6eaf0",
    background: "#fff",
  },
  tabBtn: {
    display: "grid",
    justifyItems: "center",
    alignContent: "center",
    gap: 4,
    padding: "10px 0",
    border: "none",
    background: "transparent",
    color: "#6b7a8c",
    cursor: "pointer",
    fontWeight: 600,
  },
  tabBtnActive: { color: "#0ec1ac" },
  icon: { width: 24, height: 24 },

  primary: {
    background: "#0ec1ac",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    padding: "10px 16px",
    fontWeight: 700,
    cursor: "pointer",
  },
  primaryPill: {
    background: "#77c9bd",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    padding: "10px 16px",
    fontWeight: 800,
    cursor: "pointer",
  },
  search: {
    flex: 1,
    minWidth: 200,
    border: "1px solid #e6eaf0",
    borderRadius: 999,
    padding: "10px 14px",
    outline: "none",
  },
  listGrid: {
    display: "grid",
    gap: 12,
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    alignContent: "start",
  },
  listItem: {
    position: "relative",
    padding: 16,
    borderRadius: 14,
    border: "2px solid #e6eaf0",
    background: "#fff",
    textAlign: "left",
    display: "grid",
    gap: 8,
  },
  radioOuter: {
    position: "absolute",
    right: 12,
    top: 12,
    width: 22,
    height: 22,
    borderRadius: 999,
    border: "2px solid #0ec1ac",
    display: "grid",
    placeItems: "center",
    background: "#fff",
  },
  radioDot: { width: 12, height: 12, borderRadius: 999, background: "#0ec1ac", transition: "opacity .15s ease" },

  map: {
    width: "100%",
    height: "calc(100vh - 72px - 72px - 24px)",
    borderRadius: 16,
    border: "1px solid #e6eaf0",
    background: "#e6edf2",
  },
  mapBadge: {
    position: "absolute",
    top: 14,
    left: 14,
    background: "rgba(255,255,255,.9)",
    border: "1px solid #e6eaf0",
    padding: "6px 8px",
    borderRadius: 8,
    fontSize: 12,
  },

  cardTitle: { margin: 0, fontWeight: 800, fontSize: 16 },
};

/* =============================== ICONS =============================== */
const Icons = {
  routes: (
    <svg width="24" height="24" viewBox="0 0 24 24" style={sx.icon}>
      <path d="M5 6h14M5 12h14M5 18h14" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  ),
  compass: (
    <svg width="24" height="24" viewBox="0 0 24 24" style={sx.icon}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M10 14l2-6 2 6-6-2 6-2" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  ),
  account: (
    <svg width="24" height="24" viewBox="0 0 24 24" style={sx.icon}>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M4 20c2-4 14-4 16 0" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  ),
  folder: (
    <svg width="24" height="24" viewBox="0 0 24 24" style={sx.icon}>
      <path d="M3 6h6l2 2h10v10H3z" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  ),
};

/* ============================ ENV / HELPERS ============================ */
const API =
  (import.meta as any)?.env?.VITE_API_BASE ||
  (window as any)?.__API_BASE__ ||
  "http://localhost:5100";

const authHeader = (): Record<string, string> => {
  const t = localStorage.getItem("token");
  return t ? { Authorization: `Bearer ${t}` } : {};
};

/* ============================ TYPES ============================ */
type RouteItem = { id: number; slug: string; name: string; region?: string };

type GeoGeometry =
  | { type: "LineString"; coordinates: number[][] }
  | { type: "MultiLineString"; coordinates: number[][][] };

type GeoFeature = { type: "Feature"; geometry: GeoGeometry; properties?: Record<string, any> };

type FeatureCollection = { type: "FeatureCollection"; features: GeoFeature[] };

declare global {
  interface Window {
    L: any; // Leaflet injected via CDN
  }
}

/* ============================ API CALLS ============================ */
async function fetchRouteList(): Promise<RouteItem[]> {
  // server exposes listing at /api/routes (with optional ?limit/offset/q)
  const r = await fetch(`${API}/api/routes`, { headers: authHeader() });
  const txt = await r.text();
  try {
    const j = JSON.parse(txt);
    return Array.isArray(j?.items) ? j.items : [];
  } catch {
    console.warn("Bad JSON from /api/routes:", txt);
    return [];
  }
}

async function fetchRouteGeoFC(id: number): Promise<FeatureCollection> {
  const r = await fetch(`${API}/api/routes/${id}.geojson`, { headers: authHeader() });
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const body = await r.text();
    throw new Error(`Non-JSON from ${r.url} (${r.status}): ${body.slice(0, 120)}`);
  }
  if (!r.ok) throw new Error(`geo ${r.status}`);
  return r.json();
}

/* ================================= MAIN SHELL ================================= */
export default function WebApp() {
  const nav = useNavigate();

  // auth guard
  useEffect(() => {
    if (!localStorage.getItem("token")) nav("/login", { replace: true });
  }, [nav]);

  const [tab, setTab] = useState<"routes" | "map" | "account" | "files">("routes");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const toggleId = (id: number) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div style={sx.app}>
      <div style={sx.header}>
        <h1 style={sx.h1}>
          {tab === "routes"
            ? "Select Routes"
            : tab === "map"
            ? "Map"
            : tab === "account"
            ? "My Account"
            : "File Manager"}
        </h1>
      </div>

      <div style={sx.content}>
        {tab === "routes" && (
          <RoutesScreen selected={selectedIds} onToggle={toggleId} onShowMap={() => setTab("map")} />
        )}
        {tab === "map" && <MapScreen selected={selectedIds} />}
        {tab === "account" && (
          <AccountScreen
            onLogout={() => {
              localStorage.removeItem("token");
              nav("/login", { replace: true });
            }}
          />
        )}
        {tab === "files" && <FilesScreen />}
      </div>

      <nav style={sx.tabbar}>
        <TabBtn label="Routes" active={tab === "routes"} onClick={() => setTab("routes")} icon={Icons.routes} />
        <TabBtn label="Map" active={tab === "map"} onClick={() => setTab("map")} icon={Icons.compass} />
        <TabBtn label="Account" active={tab === "account"} onClick={() => setTab("account")} icon={Icons.account} />
        <TabBtn label="Files" active={tab === "files"} onClick={() => setTab("files")} icon={Icons.folder} />
      </nav>
    </div>
  );
}

/* ================================== SCREENS ================================== */
function RoutesScreen({
  selected,
  onToggle,
  onShowMap,
}: {
  selected: number[];
  onToggle: (id: number) => void;
  onShowMap: () => void;
}) {
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const list = await fetchRouteList();
        if (alive) setRoutes(list);
      } catch (e: any) {
        if (alive) setErr(e.message || "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return routes;
    return routes.filter(
      (r) =>
        r.name?.toLowerCase().includes(s) ||
        r.slug?.toLowerCase().includes(s) ||
        r.region?.toLowerCase().includes(s)
    );
  }, [routes, q]);

  const fileRef = useRef<HTMLInputElement | null>(null);

  async function handleUploadFile(file?: File | null) {
    if (!file) return;
    setLoading(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);

      const res = await fetch(`${API}/api/routes/upload`, {
        method: "POST",
        headers: {
          ...authHeader(),
        },
        body: fd,
      });

      const body = await res.json().catch(() => ({ ok: false }));
      if (!res.ok || !body?.ok) {
        setErr((body && (body.error || JSON.stringify(body))) || `Upload failed (${res.status})`);
      } else {
        // refresh list after success
        try {
          const list = await fetchRouteList();
          setRoutes(list);
        } catch {
          // ignore
        }
        alert(`Upload succeeded — ${body.segments || 0} segment(s).`);
      }
    } catch (e: any) {
      setErr(e?.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 12 }}>
        <input
          ref={fileRef}
          style={{ display: "none" }}
          type="file"
          accept=".gpx,application/gpx+xml,text/xml"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            // clear input so same-file re-upload works
            e.currentTarget.value = "";
            if (f) handleUploadFile(f);
          }}
        />
        <button
          style={sx.primaryPill}
          onClick={() => {
            fileRef.current?.click?.();
          }}
          disabled={loading}
        >
          {loading ? "Uploading…" : "+ Create / Upload Route"}
        </button>
        <input
          placeholder="Search routes…"
          value={q}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
          style={sx.search}
        />
        <button
          onClick={onShowMap}
          disabled={selected.length === 0}
          style={{ ...sx.primary, opacity: selected.length ? 1 : 0.6 }}
        >
          Show on Map
        </button>
      </div>

      {loading ? (
        <Card center>Loading…</Card>
      ) : err ? (
        <Card center style={{ color: "#c92a2a" }}>
          Error: {err}
        </Card>
      ) : filtered.length === 0 ? (
        <Card center>No routes found.</Card>
      ) : (
        <div style={sx.listGrid}>
          {filtered.map((r) => {
            const isSelected = selected.includes(r.id);
            return (
              <button
                key={r.id}
                onClick={() => onToggle(r.id)}
                style={{
                  ...sx.listItem,
                  borderColor: isSelected ? "#0ec1ac" : "#e6eaf0",
                  background: isSelected ? "#e6fcf5" : "#fff",
                }}
                aria-pressed={isSelected}
              >
                <div style={{ fontWeight: 700 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: "#7b8a97" }}>{r.region || r.slug || "—"}</div>
                <div style={sx.radioOuter}>
                  <div style={{ ...sx.radioDot, opacity: isSelected ? 1 : 0 }} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MapScreen({ selected }: { selected: number[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRefs = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);

  // load Leaflet + map once
  useEffect(() => {
    const ensureLeaflet = () =>
      new Promise<void>((resolve) => {
        if ((window as any).L) return resolve();

        const cssId = "leaflet-css";
        if (!document.getElementById(cssId)) {
          const css = document.createElement("link");
          css.id = cssId;
          css.rel = "stylesheet";
          css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
          document.head.appendChild(css);
        }

        const jsId = "leaflet-js";
        if (!document.getElementById(jsId)) {
          const s = document.createElement("script");
          s.id = jsId;
          s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
          s.onload = () => resolve();
          document.body.appendChild(s);
        } else {
          resolve();
        }
      });

    ensureLeaflet().then(() => {
      const L = (window as any).L;
      if (!L || !containerRef.current) return;

      const map = L.map(containerRef.current, { zoomControl: true });
      mapRef.current = map;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "",
      }).addTo(map);

      map.setView([37.7749, -122.4194], 12);
      setMapReady(true);
    });

    return () => {
      mapRef.current?.remove?.();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // draw (or re-draw) when map becomes ready OR selection changes
  useEffect(() => {
    if (!mapReady) return;

    (async () => {
      const L = (window as any).L;
      const map = mapRef.current;
      if (!L || !map) return;

      // clear previous layers
      layerRefs.current.forEach((lyr) => map.removeLayer(lyr));
      layerRefs.current = [];

      if (!selected.length) return;

      const bounds = L.latLngBounds([]);

      for (const id of selected) {
        try {
          // fetch FeatureCollection and draw directly
          const fc = await fetchRouteGeoFC(id);
          const layer = L.geoJSON(fc, { style: { weight: 4, color: "#0ec1ac" } }).addTo(map);
          layerRefs.current.push(layer);

          const b = layer.getBounds?.();
          if (b && b.isValid()) bounds.extend(b);
        } catch (err) {
          console.warn("Failed to load route", id, err);
        }
      }

      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
    })();
  }, [mapReady, selected]);

  return (
    <div style={{ position: "relative" }}>
      <div ref={containerRef} style={sx.map} />
      {!selected.length && <div style={sx.mapBadge}>Select a route on the Routes tab, then come back here.</div>}
    </div>
  );
}

function AccountScreen({ onLogout }: { onLogout: () => void }) {
  // (placeholder until /api/auth/me is wired)
  const [me] = useState({ username: "DemoUser", email: "demo@example.com" });

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 520, margin: "0 auto" }}>
      <Card>
        <h3 style={sx.cardTitle}>My Account</h3>
        <Row label="Username" value={me.username} />
        <Row label="Email" value={me.email} />
      </Card>

      <Card>
        <h3 style={sx.cardTitle}>Profile Statistics</h3>
        <Row label="Cairns created" value="12" />
        <Row label="Comments written" value="14" />
        <Row label="Ratings given" value="34" />
        <Row label="Member since" value="August 9, 2025" />
      </Card>

      <button onClick={onLogout} style={{ ...sx.primary, width: 280, justifySelf: "center" }}>
        Log Out
      </button>
    </div>
  );
}

function FilesScreen() {
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
      <div style={{ fontSize: 28, color: "#6b7a8c" }}>File Manager Screen</div>
    </div>
  );
}

/* ================================== UI Bits ================================== */
function Card({
  children,
  center = false,
  style,
}: {
  children: React.ReactNode;
  center?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 16,
        border: "1px solid #e6eaf0",
        background: "#fff",
        boxShadow: "0 2px 6px rgba(16,42,67,0.06)",
        ...(center ? { display: "grid", placeItems: "center", color: "#6b7a8c" } : {}),
        ...(style || {}),
      }}
    >
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
      <div style={{ color: "#6b7a8c" }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function TabBtn({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button onClick={onClick} style={{ ...sx.tabBtn, ...(active ? sx.tabBtnActive : {}) }}>
      <span style={{ display: "grid", placeItems: "center" }}>{icon}</span>
      <span style={{ fontSize: 12 }}>{label}</span>
    </button>
  );
}
