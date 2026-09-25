export const colors = {
  background: "#F4F5F7",
  surface: "#FFFFFF",
  surfaceSecondary: "#EEF0F3",
  text: "#16181D",
  secondaryText: "#6E737D",
  separator: "#E0E3E8",
  tint: "#5D66D8",
  tintSoft: "#E8E9FF",
  destructive: "#C43F48",
  success: "#27845A",
  field: "#F7F8FA",
  white: "#FFFFFF",
} as const;

export const gradients = {
  auth: ["#E4E7FF", "#F6F7FB", "#F8F1E9"] as const,
  accent: ["#777FE5", "#555FC8"] as const,
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 12, md: 18, lg: 26, pill: 999 } as const;
