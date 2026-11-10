import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { Participant } from "./components/Participant";

export function Root() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const prefix = "#/participate/";
  const token = hash.startsWith(prefix) ? hash.slice(prefix.length) : null;
  if (token !== null) return <Participant key={token} token={token} />;
  if (import.meta.env.VITE_PUBLIC_ONLY === "true") {
    return (
      <main className="qa-content">
        <section className="qa-panel">
          <h1>Participant questionnaire</h1>
          <p>Open the participant link provided by the administrator.</p>
        </section>
      </main>
    );
  }
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
