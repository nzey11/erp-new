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
  // P4-04: AP-01 enforcement — route files must not import Prisma client directly.
  // Routes must delegate DB access to lib/modules/* services or lib/shared/* helpers.
  // Current status: WARN (81 existing violations — must be resolved before escalating to error).
  // See: .qoder/specs/erp-normalization-roadmap.md P4-04, AP-01 in erp-architecture-guardrails.md
  {
    files: ["app/api/**/*.ts", "app/api/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              group: ["@/lib/shared/db", "@/lib/shared/db/*"],
              message:
                "[AP-01] Route files must not import Prisma db directly. " +
                "Delegate DB access to a service in lib/modules/ or lib/shared/. " +
                "See erp-architecture-guardrails.md AP-01.",
            },
          ],
        },
      ],
    },
  },
  // P4-05: Cross-module barrel import enforcement.
  // External consumers must import from a module's index.ts barrel only,
  // never from internal sub-paths (schemas/, services/, handlers/, etc.).
  // Current status: WARN (~109 existing violations — must be resolved before escalating to error).
  // Applies to all code outside lib/modules/accounting/ that reaches into accounting internals,
  // all code outside lib/modules/ecommerce/ that reaches into ecommerce internals,
  // all code outside lib/modules/finance/ that reaches into finance internals.
  // See: .qoder/specs/erp-normalization-roadmap.md P4-05, Canonical Module Structure Section 6.
  {
    // Any file NOT inside lib/modules/accounting/ that imports from accounting internals
    files: [
      "app/**/*.ts",
      "app/**/*.tsx",
      "lib/modules/ecommerce/**/*.ts",
      "lib/modules/finance/**/*.ts",
      "lib/modules/integrations/**/*.ts",
      "lib/modules/auth/**/*.ts",
      "lib/party/**/*.ts",
      "lib/client/**/*.ts",
      "lib/hooks/**/*.ts",
      "components/**/*.ts",
      "components/**/*.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              group: [
                "@/lib/modules/accounting/schemas",
                "@/lib/modules/accounting/schemas/*",
                "@/lib/modules/accounting/services",
                "@/lib/modules/accounting/services/*",
                "@/lib/modules/accounting/handlers",
                "@/lib/modules/accounting/handlers/*",
                "@/lib/modules/accounting/inventory",
                "@/lib/modules/accounting/inventory/*",
                "@/lib/modules/accounting/finance",
                "@/lib/modules/accounting/finance/*",
                "@/lib/modules/accounting/domain",
                "@/lib/modules/accounting/domain/*",
                "@/lib/modules/accounting/queries",
                "@/lib/modules/accounting/queries/*",
                "@/lib/modules/accounting/projections",
                "@/lib/modules/accounting/projections/*",
              ],
              message:
                "[P4-05] Import from '@/lib/modules/accounting' barrel (index.ts) instead of reaching into module internals. " +
                "See erp-normalization-roadmap.md Section 6 Cross-Module Import Rule.",
            },
            {
              group: [
                "@/lib/modules/ecommerce/schemas",
                "@/lib/modules/ecommerce/schemas/*",
                "@/lib/modules/ecommerce/services",
                "@/lib/modules/ecommerce/services/*",
                "@/lib/modules/ecommerce/handlers",
                "@/lib/modules/ecommerce/handlers/*",
                "@/lib/modules/ecommerce/queries",
                "@/lib/modules/ecommerce/queries/*",
                "@/lib/modules/ecommerce/projections",
                "@/lib/modules/ecommerce/projections/*",
                "@/lib/modules/ecommerce/domain",
                "@/lib/modules/ecommerce/domain/*",
              ],
              message:
                "[P4-05] Import from '@/lib/modules/ecommerce' barrel (index.ts) instead of reaching into module internals. " +
                "See erp-normalization-roadmap.md Section 6 Cross-Module Import Rule.",
            },
            {
              group: [
                "@/lib/modules/finance/schemas",
                "@/lib/modules/finance/schemas/*",
                "@/lib/modules/finance/services",
                "@/lib/modules/finance/services/*",
                "@/lib/modules/finance/handlers",
                "@/lib/modules/finance/handlers/*",
                "@/lib/modules/finance/reports",
                "@/lib/modules/finance/reports/*",
                "@/lib/modules/finance/queries",
                "@/lib/modules/finance/queries/*",
              ],
              message:
                "[P4-05] Import from '@/lib/modules/finance' barrel (index.ts) instead of reaching into module internals. " +
                "See erp-normalization-roadmap.md Section 6 Cross-Module Import Rule.",
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
