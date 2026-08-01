import { marked } from "marked";
import DOMPurify, { type Config } from "dompurify";

export const MARKDOWN_SANITIZE_CONFIG: Config = {
  USE_PROFILES: { html: true, mathMl: true, svg: true },
  ADD_TAGS: ["annotation", "semantics"],
  ADD_ATTR: ["target", "encoding"],
};

let installed = false;

export function installMarkdownSanitizer(): void {
  if (installed) return;
  installed = true;
  marked.use({ hooks: { postprocess: (html: string) => String(DOMPurify.sanitize(html, MARKDOWN_SANITIZE_CONFIG)) } });
}
