import { describe, expect, it } from 'vitest';
import {
  breakpointForWidth,
  cappedContentWidth,
  createResponsiveLayout,
  gutterForWidth,
  roundToNativePixel,
  scaleControl,
  scaleFont,
  scaleSpacing,
} from './metrics';

describe('responsive metrics', () => {
  it('uses the documented breakpoints', () => {
    expect(breakpointForWidth(320)).toBe('compact');
    expect(breakpointForWidth(374)).toBe('compact');
    expect(breakpointForWidth(375)).toBe('regular');
    expect(breakpointForWidth(429)).toBe('regular');
    expect(breakpointForWidth(430)).toBe('largePhone');
    expect(breakpointForWidth(599)).toBe('largePhone');
    expect(breakpointForWidth(600)).toBe('tablet');
  });

  it('clamps each scale at its lower and upper bound', () => {
    expect(scaleFont(10, 320, 10)).toBe(10);
    expect(scaleFont(10, 599, 10)).toBe(10);
    expect(scaleFont(10, 600, 10)).toBe(10);
    expect(scaleFont(10, 1024, 10)).toBe(12.4);
    expect(scaleControl(10, 320, 10)).toBe(10);
    expect(scaleControl(10, 599, 10)).toBe(10);
    expect(scaleControl(10, 1024, 10)).toBe(11.6);
    expect(scaleSpacing(10, 320, 10)).toBe(10);
    expect(scaleSpacing(10, 599, 10)).toBe(10);
    expect(scaleSpacing(10, 1024, 10)).toBe(11);
  });

  it.each([320, 375, 412, 430, 599])(
    'keeps the original phone dimensions at %spx',
    (width) => {
      const layout = createResponsiveLayout(width, 915, 3);
      expect(layout.fontScale).toBe(1);
      expect(layout.controlScale).toBe(1);
      expect(layout.spacingScale).toBe(1);
      expect(layout.scaleFont(16)).toBe(16);
      expect(layout.scaleControl(44)).toBe(44);
      expect(layout.scaleSpacing(24)).toBe(24);
    },
  );

  it('rounds scaled values to the nearest native pixel', () => {
    expect(roundToNativePixel(10.26, 2)).toBe(10.5);
    expect(scaleFont(13, 412, 3)).toBe(13);
    expect(scaleFont(13, 700, 3)).toBe(46 / 3);
  });

  it('uses breakpoint gutters and caps content widths', () => {
    expect(gutterForWidth(374)).toBe(20);
    expect(gutterForWidth(430)).toBe(24);
    expect(gutterForWidth(768)).toBe(32);
    expect(cappedContentWidth(1024, 'primary')).toBe(720);
    expect(cappedContentWidth(768, 'form')).toBe(560);
    expect(cappedContentWidth(600, 'dialog')).toBe(440);
  });

  it('builds bound helpers from current window dimensions', () => {
    const layout = createResponsiveLayout(800, 1280, 2);
    expect(layout.breakpoint).toBe('tablet');
    expect(layout.isTablet).toBe(true);
    expect(layout.scaleControl(44)).toBe(51);
    expect(layout.contentWidth()).toBe(720);
  });

  it.each([
    [320, 568, 'compact'],
    [375, 812, 'regular'],
    [412, 915, 'regular'],
    [430, 932, 'largePhone'],
    [600, 960, 'tablet'],
    [768, 1024, 'tablet'],
    [800, 1280, 'tablet'],
    [1024, 1366, 'tablet'],
  ] as const)('resolves the QA profile %sx%s', (width, height, breakpoint) => {
    const layout = createResponsiveLayout(width, height, 3);
    expect(layout.breakpoint).toBe(breakpoint);
    expect(layout.contentWidth('primary')).toBeLessThanOrEqual(720);
    expect(layout.contentWidth('form')).toBeLessThanOrEqual(560);
    expect(layout.contentWidth('dialog')).toBeLessThanOrEqual(440);
    expect(layout.scaleControl(44)).toBeGreaterThanOrEqual(44);
  });
});
