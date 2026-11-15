import type { ReactNode } from "react";
import { LanguageContext, SetLanguageContext } from "./i18n";
import type { Language } from "./i18n";

export function LanguageProvider({
  language,
  setLanguage,
  children,
}: {
  language: Language;
  setLanguage: (language: Language) => void;
  children: ReactNode;
}) {
  return (
    <LanguageContext.Provider value={language}>
      <SetLanguageContext.Provider value={setLanguage}>
        {children}
      </SetLanguageContext.Provider>
    </LanguageContext.Provider>
  );
}
