import { describe, expect, it } from 'vitest';
import { conservativeTailoring, isMinimalTailoring } from './minimal-tailoring';

const rushingBase = "You've sometimes felt rushed during this Salah.";
const distraction = 'Need to leave early';

describe('minimal AI reminder tailoring', () => {
  it('accepts a small bespoke adjustment that preserves the base reminder', () => {
    expect(isMinimalTailoring(
      rushingBase,
      "You've sometimes felt rushed about leaving early during this Salah.",
      distraction,
    )).toBe(true);
  });

  it('does not require the custom distraction label to be repeated verbatim', () => {
    expect(isMinimalTailoring(
      rushingBase,
      "You've sometimes felt rushed when needing to leave early during this Salah.",
      distraction,
    )).toBe(true);
  });

  it('rejects a newly invented reminder like the reported rushing result', () => {
    expect(isMinimalTailoring(
      rushingBase,
      'As you begin Fajr, take a breath and release the rush. Even a few moments of unhurried presence with Allah can transform your prayer. Let time fade away.',
      distraction,
    )).toBe(false);
  });

  it('rejects creative copy even when it includes the custom distraction', () => {
    expect(isMinimalTailoring(
      rushingBase,
      'Need to leave early? Release that pressure and let time fade away as you find a transformative moment of stillness with Allah.',
      distraction,
    )).toBe(false);
  });

  it('uses the untouched base reminder in the conservative fallback', () => {
    expect(conservativeTailoring(rushingBase, distraction)).toBe(
      `You often struggle with "Need to leave early" for this Salah. ${rushingBase}`,
    );
  });
});
