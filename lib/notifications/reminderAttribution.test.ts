import { describe, expect, it } from 'vitest';
import { resolveReminderTypeForLog } from './reminderAttribution';

const baseInput = {
  isToday: true,
  fromSalahMode: true,
  selectedSalah: 'fajr' as const,
  salahModeSalah: 'fajr' as const,
  pendingReminderType: 'ayah',
};

describe('reminder attribution', () => {
  it('uses the last reminder opened in Salah Mode instead of the scheduled reminder', () => {
    expect(resolveReminderTypeForLog({
      ...baseInput,
      lastOpenedReminderType: 'short',
    })).toBe('short');

    // Re-entering Salah Mode replaces the previously opened reminder.
    expect(resolveReminderTypeForLog({
      ...baseInput,
      lastOpenedReminderType: 'hadith',
    })).toBe('hadith');
  });

  it('does not fall back to a scheduled type when the opened reminder is untracked', () => {
    expect(resolveReminderTypeForLog({
      ...baseInput,
      lastOpenedReminderType: null,
    })).toBeNull();
  });

  it('does not attribute a Salah Mode reminder to a different Salah', () => {
    expect(resolveReminderTypeForLog({
      ...baseInput,
      selectedSalah: 'dhuhr',
      lastOpenedReminderType: 'short',
    })).toBeNull();
  });

  it('retains scheduled-reminder attribution for a normal same-day log', () => {
    expect(resolveReminderTypeForLog({
      ...baseInput,
      fromSalahMode: false,
      lastOpenedReminderType: null,
    })).toBe('ayah');
  });
});
