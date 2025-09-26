import { Routes, Route } from "react-router-dom";
import Login from "./components/Login";
import Register from "./components/Register";
import RoutesList from "./components/RoutesList";
import RouteView from "./components/RouteView";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/routes" element={<RoutesList />} />
      <Route path="/route/:id" element={<RouteView />} />
    </Routes>
  );
}
