export const HOSTING_PROVIDER_IDS = ["docker", "fly", "aws"] as const;

export type Target = (typeof HOSTING_PROVIDER_IDS)[number];

export const isTarget = (value: unknown): value is Target =>
  typeof value === "string" && (HOSTING_PROVIDER_IDS as readonly string[]).includes(value);

export const hostingProviderChoices = (): string =>
  `${HOSTING_PROVIDER_IDS.slice(0, -1).join(", ")}, or ${HOSTING_PROVIDER_IDS.at(-1)}`;
