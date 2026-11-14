import { createContext, useContext } from "react";
import portuguese from "./translations/pt-BR.json";

export type Language = "en" | "pt-BR";

export class FrontendError extends Error {}

type Variables = Record<string, string | number>;

export const LanguageContext = createContext<Language>("en");

export function requestedLanguage(): Language {
  return new URLSearchParams(window.location.search).get("lang") === "pt-BR"
    ? "pt-BR"
    : "en";
}

export function translate(
  language: Language,
  message: string,
  variables: Variables = {},
): string {
  const template =
    language === "pt-BR"
      ? ((portuguese as Record<string, string>)[message] ?? message)
      : message;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(variables, key) ? String(variables[key]) : match,
  );
}

export function formatNumber(
  language: Language,
  value: number,
  maximumFractionDigits = 0,
): string {
  return new Intl.NumberFormat(language, { maximumFractionDigits }).format(
    value,
  );
}

export function presentError(
  language: Language,
  error: unknown,
  fallback: string,
): string {
  if (error instanceof FrontendError) return translate(language, error.message);
  if (error instanceof Error) return error.message;
  return translate(language, fallback);
}

export function useI18n() {
  const language = useContext(LanguageContext);
  return {
    language,
    t: (message: string, variables?: Variables) =>
      translate(language, message, variables),
    n: (value: number, maximumFractionDigits?: number) =>
      formatNumber(language, value, maximumFractionDigits),
  };
}
