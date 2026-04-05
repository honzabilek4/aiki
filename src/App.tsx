import Terminal from "./components/Terminal";
import { useConfig } from "./hooks/useConfig";

function App() {
  const { config } = useConfig();

  if (!config) return null;

  return (
    <>
      <div data-tauri-drag-region className="titlebar" />
      <Terminal config={config} />
    </>
  );
}

export default App;
