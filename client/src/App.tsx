import { Routes, Route } from "react-router-dom";
import Login from "./components/Login";
import Register from "./components/Register";
import TrailsList from "./components/TrailsList";
import TrailView from "./components/TrailView";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/trails" element={<TrailsList />} />
      <Route path="/trail/:id" element={<TrailView />} />
    </Routes>
  );
}
