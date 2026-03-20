import type { ThemeConfig } from "antd";
import ruRU from "antd/locale/ru_RU";

/**
 * Russian validation messages for Ant Design forms.
 * Used globally via ConfigProvider form.validateMessages.
 */
export const validateMessages = {
  required: 'Поле "${label}" обязательно для заполнения',
  types: {
    email: '${label} — некорректный email',
    number: '${label} — должно быть числом',
    url: '${label} — некорректный URL',
  },
  number: {
    range: '${label} должно быть от ${min} до ${max}',
    min: '${label} не может быть меньше ${min}',
    max: '${label} не может быть больше ${max}',
  },
  string: {
    min: '${label} минимум ${min} символов',
    max: '${label} максимум ${max} символов',
    len: '${label} должно быть ${len} символов',
  },
  pattern: {
    mismatch: '${label} не соответствует формату',
  },
};

/**
 * Ant Design theme token bridge.
 * Maps ListOpt design system to antd ConfigProvider tokens.
 * oklch values from globals.css are approximated to hex for antd compatibility.
 *
 * Note: cssVar.key is set to 'app' to ensure stable CSS variable hashes between
 * server and client rendering, preventing hydration mismatches in Next.js SSR.
 */
export const antdLocale = ruRU;

export const antdTheme: ThemeConfig = {
  cssVar: { key: "app" },
  token: {
    // Primary color — maps to --primary: oklch(0.205 0 0) ≈ #1a1a1a (dark gray)
    // Using standard antd blue for ERP primary actions instead of the nearly-black primary
    colorPrimary: "#1677ff",
    colorBgBase: "#ffffff",
    colorTextBase: "#1a1a1a",
    colorBorder: "#e9e9e9",
    colorBgContainer: "#ffffff",
    colorBgElevated: "#ffffff",
    borderRadius: 6,
    fontSize: 14,
    fontFamily:
      "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  components: {
    Table: {
      headerBg: "#fafafa",
      rowHoverBg: "#f5f5f5",
      borderColor: "#f0f0f0",
      headerSplitColor: "#f0f0f0",
    },
    Layout: {
      bodyBg: "#ffffff",
    },
  },
};
