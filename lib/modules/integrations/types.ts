// Integration types
export type IntegrationType = "telegram";

export interface IntegrationConfig {
  id: string;
  type: IntegrationType;
  name: string;
  isEnabled: boolean;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface TelegramIntegrationSettings {
  botToken: string;
  botUsername: string;
  enableAdminLogin: boolean;
  enableStoreLogin: boolean;
}

export interface IntegrationStatus {
  type: IntegrationType;
  isConfigured: boolean;
  isEnabled: boolean;
  statusMessage?: string;
}
