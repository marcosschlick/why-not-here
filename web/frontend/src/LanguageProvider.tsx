import type { ReactNode } from "react";
import { LanguageContext } from "./i18n";
import type { Language } from "./i18n";

export function LanguageProvider({
  language,
  children,
}: {
  language: Language;
  children: ReactNode;
}) {
  return (
    <LanguageContext.Provider value={language}>
      {children}
    </LanguageContext.Provider>
  );
}
