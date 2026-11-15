import { useContext } from "react";
import { SetLanguageContext, useI18n } from "../i18n";

export function LanguageButton() {
  const { language, t } = useI18n();
  const setLanguage = useContext(SetLanguageContext);
  const next = language === "en" ? "pt-BR" : "en";
  const label = t(
    next === "pt-BR" ? "Switch to Portuguese" : "Switch to English",
  );

  return (
    <button
      type="button"
      className="btn-topbar-about"
      onClick={() => setLanguage(next)}
      aria-label={label}
      title={label}
    >
      {next === "pt-BR" ? "PT-BR" : "EN"}
    </button>
  );
}
