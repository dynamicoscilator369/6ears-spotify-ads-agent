import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          OPERATOR_API_KEY: "test-operator-key-00000000000000000000000000000000",
          SPOTIFY_CLIENT_ID: "test-client-id",
          SPOTIFY_CLIENT_SECRET: "test-client-secret",
          SPOTIFY_REFRESH_TOKEN: "test-refresh-token",
          SPOTIFY_AD_ACCOUNT_ID: "test-ad-account",
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
  },
});
