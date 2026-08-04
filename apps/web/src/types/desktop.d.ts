import type { AiApiConfiguration } from "../features/ai/aiProvider";

declare global {
  interface Window {
    perfboardDesktop?: {
      aiConfig: {
        load(): Promise<(AiApiConfiguration & { storage?: string }) | undefined>;
        save(configuration: AiApiConfiguration): Promise<{ storage: string }>;
      };
      aiApi: {
        request(request: {
          url: string;
          method?: string;
          headers?: Record<string, string>;
          body?: string;
        }): Promise<{ ok: boolean; status: number; statusText: string; body: string }>;
      };
    };
  }
}

export {};
