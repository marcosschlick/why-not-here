import { StrictMode, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { Participant } from "./components/Participant";
import { requestedLanguage, useI18n } from "./i18n";
import { LanguageProvider } from "./LanguageProvider";

export function Root() {
  const language = requestedLanguage();
  const isQuestionnaire = window.location.pathname === "/questionnaire";
  const isPublicOnly = import.meta.env.VITE_PUBLIC_ONLY === "true";
  useLayoutEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  if (isQuestionnaire) {
    return (
      <LanguageProvider language={language}>
        <Participant />
      </LanguageProvider>
    );
  }
  if (isPublicOnly) {
    return (
      <LanguageProvider language={language}>
        <PublicOnlyNotice />
      </LanguageProvider>
    );
  }
  return (
    <LanguageProvider language={language}>
      <App />
    </LanguageProvider>
  );
}

function PublicOnlyNotice() {
  const { t } = useI18n();
  return (
    <main className="qa-content">
      <section className="qa-panel">
        <h1>{t("Participant questionnaire")}</h1>
        <p>{t("Open the participant link provided by the administrator.")}</p>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
