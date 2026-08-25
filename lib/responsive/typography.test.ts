import { describe, expect, it } from 'vitest';
import {
  APP_MAX_FONT_SIZE_MULTIPLIER,
  resolveResponsiveTypography,
  resolveTypographyToken,
} from './typography';

describe('responsive typography', () => {
  it('caps system font amplification at a modest accessibility increase', () => {
    expect(APP_MAX_FONT_SIZE_MULTIPLIER).toBe(1.15);
  });
  it('resolves explicit Tailwind size tokens among color utilities', () => {
    expect(resolveTypographyToken('text-ink-700 font-semibold text-lg')).toEqual({
      fontSize: 15.75,
      lineHeight: 24.5,
    });
  });

  it('leaves text without a size undefined so nested text inherits', () => {
    expect(resolveTypographyToken('text-sage-600 font-medium')).toBeUndefined();
    expect(resolveResponsiveTypography('text-sage-600', undefined, undefined, (v) => v * 1.2))
      .toBeUndefined();
  });

  it('scales token and inline typography consistently', () => {
    expect(resolveResponsiveTypography('text-sm', undefined, undefined, (v) => v * 1.2))
      .toEqual({ fontSize: 14.7, lineHeight: 21 });
    expect(resolveResponsiveTypography(undefined, 15, 22, (v) => v * 1.2))
      .toEqual({ fontSize: 18, lineHeight: 26.4 });
  });

  it('honours relaxed line height', () => {
    expect(resolveResponsiveTypography('text-sm leading-relaxed', undefined, undefined, (v) => v))
      .toEqual({ fontSize: 12.25, lineHeight: 19.90625 });
  });
});
