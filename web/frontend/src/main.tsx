import { StrictMode, useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { Participant } from "./components/Participant";
import { requestedLanguage, useI18n } from "./i18n";
import type { Language } from "./i18n";
import { LanguageProvider } from "./LanguageProvider";

export function Root() {
  const [language, setLanguage] = useState(requestedLanguage);
  function changeLanguage(next: Language) {
    const url = new URL(window.location.href);
    if (next === "pt-BR") url.searchParams.set("lang", next);
    else url.searchParams.delete("lang");
    window.history.replaceState(window.history.state, "", url);
    setLanguage(next);
  }
  const isQuestionnaire = window.location.pathname === "/questionnaire";
  const isPublicOnly = import.meta.env.VITE_PUBLIC_ONLY === "true";
  useLayoutEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  if (isQuestionnaire) {
    return (
      <LanguageProvider language={language} setLanguage={changeLanguage}>
        <Participant />
      </LanguageProvider>
    );
  }
  if (isPublicOnly) {
    return (
      <LanguageProvider language={language} setLanguage={changeLanguage}>
        <PublicOnlyNotice />
      </LanguageProvider>
    );
  }
  return (
    <LanguageProvider language={language} setLanguage={changeLanguage}>
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
