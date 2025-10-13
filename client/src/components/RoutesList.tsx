import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
const API = import.meta.env.VITE_API_BASE || "http://localhost:5000";

interface Route {
  id: number;
  name: string;
  distance_m: number;
  points_n: number;
}

export default function RoutesList() {
  const [items, setItems] = useState<Route[]>([]);

  useEffect(() => {
    fetch(`${API}/api/routes/list?limit=50`)
      .then((r) => r.json())
      .then((data) => setItems(data.items ?? []))
      .catch(console.error);
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", padding: 16 }}>
      <h1>Routes</h1>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {items.map((t) => (
          <li key={t.id} style={{ margin: "10px 0" }}>
            <strong>{t.name}</strong> — {(t.distance_m / 1000).toFixed(1)} km
            <div style={{ marginTop: 5 }}>
              <Link to={`/route/${t.id}`}>View</Link> |{" "}
              <a href={`${API}/api/routes/${t.id}.gpx`} target="_blank">
                Download GPX
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
