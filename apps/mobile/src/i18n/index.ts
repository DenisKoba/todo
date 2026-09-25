import { en, type TranslationKey } from "./en";

// Add new locale dictionaries beside en.ts and resolve them here.
export const t = (key: TranslationKey): string => en[key];
