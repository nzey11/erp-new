import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import nxPlugin from "@nx/eslint-plugin";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      "@nx": nxPlugin,
    },
    rules: {
      "@nx/enforce-module-boundaries": [
        "error",
        {
          enforceBuildableLibDependency: true,
          allow: ["^@/"],
          depConstraints: [
            {
              sourceTag: "scope:shared",
              onlyDependOnLibsWithTags: ["scope:shared"],
            },
            {
              sourceTag: "scope:accounting",
              onlyDependOnLibsWithTags: ["scope:shared", "scope:accounting"],
            },
            {
              sourceTag: "scope:ecommerce",
              onlyDependOnLibsWithTags: [
                "scope:shared",
                "scope:accounting",
                "scope:ecommerce",
              ],
            },
            {
              sourceTag: "scope:erp",
              onlyDependOnLibsWithTags: [
                "scope:shared",
                "scope:accounting",
                "scope:ecommerce",
                "scope:erp",
              ],
            },
          ],
        },
      ],
    },
  },
  // Public API enforcement: ecommerce code must not reach into accounting internals
  {
    files: [
      "app/api/ecommerce/**/*.ts",
      "app/api/ecommerce/**/*.tsx",
      "app/store/**/*.ts",
      "app/store/**/*.tsx",
      "lib/modules/ecommerce/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/lib/modules/accounting/*",
                "@/lib/modules/accounting/**",
              ],
              message:
                "Import from '@/lib/modules/accounting' barrel export instead of reaching into module internals.",
            },
          ],
        },
      ],
    },
  },
  // Public API enforcement: accounting code must not reach into ecommerce internals
  {
    files: [
      "app/api/accounting/**/*.ts",
      "app/api/accounting/**/*.tsx",
      "app/(accounting)/**/*.ts",
      "app/(accounting)/**/*.tsx",
      "lib/modules/accounting/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/lib/modules/ecommerce/*",
                "@/lib/modules/ecommerce/**",
              ],
              message:
                "Import from '@/lib/modules/ecommerce' barrel export instead of reaching into module internals.",
            },
          ],
        },
      ],
    },
  },
  // Public API enforcement: shared components must use barrel exports for all modules
  {
    files: ["components/**/*.ts", "components/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/lib/modules/accounting/*",
                "@/lib/modules/accounting/**",
              ],
              message:
                "Import from '@/lib/modules/accounting' barrel export instead.",
            },
            {
              group: [
                "@/lib/modules/ecommerce/*",
                "@/lib/modules/ecommerce/**",
              ],
              message:
                "Import from '@/lib/modules/ecommerce' barrel export instead.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Nx cache
    ".nx/**",
    // Generated files
    "lib/generated/**",
  ]),
]);

export default eslintConfig;
