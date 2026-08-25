export type TypographyToken = {
  fontSize: number;
  lineHeight: number;
};

// Preserve a modest accessibility increase without allowing large system font
// multipliers to overwhelm narrow controls and navigation labels.
export const APP_MAX_FONT_SIZE_MULTIPLIER = 1.15;

export const TYPOGRAPHY_TOKENS = {
  // NativeWind uses a 14-point rem on native platforms. These values mirror
  // its generated styles exactly, preserving the pre-responsive phone sizes.
  'text-xs': { fontSize: 10.5, lineHeight: 14 },
  'text-sm': { fontSize: 12.25, lineHeight: 17.5 },
  'text-base': { fontSize: 14, lineHeight: 21 },
  'text-lg': { fontSize: 15.75, lineHeight: 24.5 },
  'text-xl': { fontSize: 17.5, lineHeight: 24.5 },
  'text-2xl': { fontSize: 21, lineHeight: 28 },
  'text-3xl': { fontSize: 26.25, lineHeight: 31.5 },
  'text-4xl': { fontSize: 31.5, lineHeight: 35 },
  'text-5xl': { fontSize: 42, lineHeight: 42 },
  'text-6xl': { fontSize: 52.5, lineHeight: 52.5 },
} as const satisfies Record<string, TypographyToken>;

export type TypographyTokenName = keyof typeof TYPOGRAPHY_TOKENS;

const TOKEN_PATTERN = /(?:^|\s)(text-(?:xs|sm|base|lg|xl|[2-6]xl))(?=\s|$)/g;

export function resolveTypographyToken(className?: string): TypographyToken | undefined {
  if (!className) return undefined;

  let match: RegExpExecArray | null;
  let token: TypographyToken | undefined;
  while ((match = TOKEN_PATTERN.exec(className)) !== null) {
    token = TYPOGRAPHY_TOKENS[match[1] as TypographyTokenName];
  }
  TOKEN_PATTERN.lastIndex = 0;
  return token;
}

export function resolveResponsiveTypography(
  className: string | undefined,
  inlineFontSize: number | undefined,
  inlineLineHeight: number | undefined,
  fontScale: (value: number) => number,
) {
  const token = resolveTypographyToken(className);
  const baseFontSize = inlineFontSize ?? token?.fontSize;
  if (baseFontSize === undefined) return undefined;

  const relaxed = className?.split(/\s+/).includes('leading-relaxed');
  const baseLineHeight = inlineLineHeight
    ?? (relaxed ? baseFontSize * 1.625 : token?.lineHeight);

  return {
    fontSize: fontScale(baseFontSize),
    ...(baseLineHeight === undefined ? {} : { lineHeight: fontScale(baseLineHeight) }),
  };
}
