import Terminal from "./components/Terminal";

function App() {
  return (
    <>
      <div data-tauri-drag-region className="titlebar" />
      <Terminal />
    </>
  );
}

export default App;
