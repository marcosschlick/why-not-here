import { StrictMode, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { Participant } from "./components/Participant";
import { requestedLanguage } from "./i18n";
import { LanguageProvider } from "./LanguageProvider";

export function Root() {
  const language = requestedLanguage();
  const isQuestionnaire = window.location.pathname === "/questionnaire";
  const isPublicOnly = import.meta.env.VITE_PUBLIC_ONLY === "true";
  useLayoutEffect(() => {
    document.documentElement.lang =
      isQuestionnaire || isPublicOnly ? "en" : language;
  }, [isQuestionnaire, isPublicOnly, language]);
  if (isQuestionnaire) {
    return <Participant />;
  }
  if (isPublicOnly) {
    return (
      <main className="qa-content">
        <section className="qa-panel">
          <h1>Participant questionnaire</h1>
          <p>Open the participant link provided by the administrator.</p>
        </section>
      </main>
    );
  }
  return (
    <LanguageProvider language={language}>
      <App />
    </LanguageProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
