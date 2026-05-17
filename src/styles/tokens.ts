export const tokens = {
  color: {
    primary: '#1DAD97',
    secondary: '#F4EDE0',
    surface: '#FFFFFF',
    surfaceAlt: '#FFF9EF',
    text: '#111827',
    muted: '#4B5563',
    border: '#1F2937',
    success: '#16A34A',
    warning: '#D97706',
    danger: '#DC2626',
    focus: '#0F766E'
  },
  space: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    xxl: '32px'
  },
  radius: {
    sm: '10px',
    md: '16px',
    pill: '999px'
  },
  type: {
    fontFamily: '"Delicious Handrawn", "Segoe UI", system-ui, sans-serif',
    monoFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace'
  }
} as const;

export type DesignTokens = typeof tokens;
