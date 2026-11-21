/** All browser/Electron local-storage keys live here, with the legacy names kept stable. */
export const STORAGE_KEYS = {
  project: "perfboard-autoroute-project",
  settings: "perfboard-autoroute-settings",
  aiConfig: "perfboard-ai-api-configuration",
  pinProfiles: "protoroute-pin-profiles",
  profileOutbox: "protoroute-profile-outbox",
  packagePinOverrides: "protoroute-package-pin-overrides",
  pinDraftPrefix: "protoroute-pin-draft"
} as const;
