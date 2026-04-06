import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import Settings from "./Settings.tsx";

const isSettings = new URLSearchParams(window.location.search).has("settings");

createRoot(document.getElementById("root")!).render(
  isSettings ? <Settings /> : <App />
);
