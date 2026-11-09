import type { Site } from "../../src/vowel/types";
export function siteMarkup(
  site: Site,
  base?: string,
  page?: string,
  preview?: boolean,
  platformOrigin?: string,
): string;
export function documentShell(input: {
  title: string;
  description?: string;
  content: string;
  boot?: unknown;
  script?: string;
  css?: string;
  canonical?: string;
  privatePage?: boolean;
}): string;
export function ruleSentences(site: Site): string[];
export function paletteStyle(id: string): string;
