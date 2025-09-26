// TrailsList.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";


// This sets up the 'base URL' for the backend API, First tries to read VITE_API_BASE environment variable set in .env
// Otherwise fallsback to the localhost:5000 development URL
const API = import.meta?.env?.VITE_API_BASE || "http://localhost:5000";



export default function TrailsList() {

  // Creates a constant called items that starts as an empty array
  // setItems is the function that will be calledto update its state
  // 'starts empty, then later filled with trail data' 
  const [items, setItems] = useState([]);



  useEffect(() => { // Tells React to runs this code after the first component renders 
    fetch(`${API}/api/routes/list?limit=50`) // Combines the API variable with the API call we are trying to make and fetch 
      .then(r => r.json()) // Parses the response object from fetch into a JavaScript object 
      .then(data => setItems(data.items ?? [])) // Data is grabbed by the parsed JSON
      .catch(console.error);
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", padding: 16 }}>
      <h1>Trails</h1>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {items.map(t => (
          <li key={t.id}
              style={{ display:"flex", justifyContent:"space-between",
                       alignItems:"center", padding:"10px 0", borderBottom:"1px solid #eee" }}>
            <div>
              <div style={{ fontWeight: 600 }}>{t.name}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {(t.distance_m || 0)/1000} km • {t.points_n} pts
              </div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <Link to={`/trail/${t.id}`}>
                <button>View</button>
              </Link>
              <a href={`${API}/api/routes/${t.id}.gpx`} target="_blank" rel="noreferrer">
                <button>Download GPX</button>
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
