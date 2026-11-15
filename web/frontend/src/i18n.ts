import { createContext, useContext } from "react";
import portuguese from "./translations/pt-BR.json";

export type Language = "en" | "pt-BR";

export class FrontendError extends Error {}

export class ApiError extends Error {
  readonly fallback: string;

  constructor(message: string, fallback: string) {
    super(message);
    this.fallback = fallback;
  }
}

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
  if (error instanceof ApiError) {
    if (language === "en") return error.message;
    const endpoint =
      /^Endpoint \((-?\d+), (-?\d+)\) (is blocked and cannot be modified|falls outside the grid)\.$/.exec(
        error.message,
      );
    if (endpoint) {
      const template =
        endpoint[3] === "falls outside the grid"
          ? "Endpoint ({row}, {column}) falls outside the grid."
          : "Endpoint ({row}, {column}) is blocked and cannot be modified.";
      return translate(language, template, {
        row: formatNumber(language, Number(endpoint[1])),
        column: formatNumber(language, Number(endpoint[2])),
      });
    }
    const fieldRule =
      /^([A-Z][A-Z0-9_.]*) must be (a finite number greater than zero|greater than zero|a positive integer|between 0 and 1|one of: .+)\.$/.exec(
        error.message,
      );
    if (fieldRule) {
      const rule = fieldRule[2].startsWith("one of: ")
        ? translate(language, "one of: {values}", {
            values: fieldRule[2].slice(8),
          })
        : translate(language, fieldRule[2]);
      return translate(language, "{field} must be {rule}.", {
        field: fieldRule[1],
        rule,
      });
    }
    const unknownFields =
      /^(Unknown configuration parameters|Unknown experiment parameters): (.+)\.$/.exec(
        error.message,
      );
    if (unknownFields) {
      return translate(language, "Unknown configuration fields: {fields}.", {
        fields: unknownFields[2],
      });
    }
    const translated = translate(language, error.message);
    return translated === error.message
      ? translate(language, error.fallback)
      : translated;
  }
  if (error instanceof Error) {
    return language === "en" ? error.message : translate(language, fallback);
  }
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
