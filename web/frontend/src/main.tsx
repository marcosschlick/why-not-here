import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { Participant } from "./components/Participant";

export function Root() {
  if (window.location.pathname === "/questionnaire") return <Participant />;
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
