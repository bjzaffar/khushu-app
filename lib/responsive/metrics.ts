export type ResponsiveBreakpoint = 'compact' | 'regular' | 'largePhone' | 'tablet';

export type ResponsiveMaxWidth = 'primary' | 'form' | 'dialog';

export type ResponsiveLayout = {
  width: number;
  height: number;
  breakpoint: ResponsiveBreakpoint;
  isTablet: boolean;
  fontScale: number;
  controlScale: number;
  spacingScale: number;
  gutter: number;
  maxWidths: Record<ResponsiveMaxWidth, number>;
  scaleFont: (value: number) => number;
  scaleControl: (value: number) => number;
  scaleSpacing: (value: number) => number;
  contentWidth: (kind?: ResponsiveMaxWidth) => number;
};

export const RESPONSIVE_MAX_WIDTHS: Record<ResponsiveMaxWidth, number> = {
  primary: 720,
  form: 560,
  dialog: 440,
};

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function roundToNativePixel(value: number, pixelRatio = 1) {
  return Math.round(value * pixelRatio) / pixelRatio;
}

export function breakpointForWidth(width: number): ResponsiveBreakpoint {
  if (width < 375) return 'compact';
  if (width < 430) return 'regular';
  if (width < 600) return 'largePhone';
  return 'tablet';
}

export function gutterForWidth(width: number) {
  const breakpoint = breakpointForWidth(width);
  if (breakpoint === 'tablet') return 32;
  if (breakpoint === 'largePhone') return 24;
  return 20;
}

function tabletScale(width: number, maximum: number) {
  if (width < 600) return 1;
  return clamp(width / 600, 1, maximum);
}

export function scaleFont(value: number, width: number, pixelRatio = 1) {
  return roundToNativePixel(value * tabletScale(width, 1.24), pixelRatio);
}

export function scaleControl(value: number, width: number, pixelRatio = 1) {
  return roundToNativePixel(value * tabletScale(width, 1.16), pixelRatio);
}

export function scaleSpacing(value: number, width: number, pixelRatio = 1) {
  return roundToNativePixel(value * tabletScale(width, 1.1), pixelRatio);
}

export function cappedContentWidth(width: number, kind: ResponsiveMaxWidth = 'primary') {
  return Math.min(width, RESPONSIVE_MAX_WIDTHS[kind]);
}

export function createResponsiveLayout(
  width: number,
  height: number,
  pixelRatio = 1,
): ResponsiveLayout {
  const breakpoint = breakpointForWidth(width);
  const fontScale = tabletScale(width, 1.24);
  const controlScale = tabletScale(width, 1.16);
  const spacingScale = tabletScale(width, 1.1);

  return {
    width,
    height,
    breakpoint,
    isTablet: breakpoint === 'tablet',
    fontScale,
    controlScale,
    spacingScale,
    gutter: gutterForWidth(width),
    maxWidths: RESPONSIVE_MAX_WIDTHS,
    scaleFont: (value) => roundToNativePixel(value * fontScale, pixelRatio),
    scaleControl: (value) => roundToNativePixel(value * controlScale, pixelRatio),
    scaleSpacing: (value) => roundToNativePixel(value * spacingScale, pixelRatio),
    contentWidth: (kind = 'primary') => cappedContentWidth(width, kind),
  };
}
