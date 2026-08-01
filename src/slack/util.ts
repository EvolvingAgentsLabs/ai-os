export function inlineCode(text: string): string {
  const safe = text.replace(/`/g, "'").slice(0, 2000);
  return `\`${safe}${text.length > safe.length ? "..." : ""}\``;
}

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
