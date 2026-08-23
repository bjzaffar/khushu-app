import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import templates from '@/content/reminders/distraction_templates.json';

const mocks = vi.hoisted(() => ({
  settingValue: JSON.stringify([{ key: 'custom_noise', label: 'Noise' }]),
  secureValues: new Map<string, string>(),
  getSession: vi.fn(),
}));

vi.mock('expo-secure-store', () => ({
  getItem: (key: string) => mocks.secureValues.get(key) ?? null,
  setItem: (key: string, value: string) => mocks.secureValues.set(key, value),
  deleteItemAsync: async (key: string) => {
    mocks.secureValues.delete(key);
  },
}));

vi.mock('@/db/database', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ get: () => ({ value: mocks.settingValue }) }),
        all: () => [],
      }),
    }),
  },
}));

vi.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

import { generateAIReminder, getReminderContent } from './reminderContent';
import { useAppStore } from '@/store/appStore';

const customPattern = {
  phase: 'established' as const,
  topDistraction: 'custom_noise',
  frequency: 0.75,
  logCount: 4,
  totalLogs: 4,
};

describe('custom-distraction fallback reminders', () => {
  beforeEach(() => {
    mocks.settingValue = JSON.stringify([{ key: 'custom_noise', label: 'Noise' }]);
    mocks.secureValues.clear();
    mocks.getSession.mockReset();
    useAppStore.getState().setPremiumStatus('free');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('combines the custom label with a randomly selected cold-start reminder', () => {
    vi.spyOn(Math, 'random').mockReturnValue(4 / templates.cold_start.length);

    const reminder = getReminderContent(customPattern);

    expect(reminder).toEqual({
      text: 'You\'ve been struggling with "Noise". The world can wait. This cannot.',
      type: 'short',
    });
    expect(templates.cold_start.some(({ text }) => reminder.text.endsWith(text))).toBe(true);
  });

  it('can select a different cold-start ending on another scheduling pass', () => {
    const random = vi.spyOn(Math, 'random');
    random.mockReturnValueOnce(0).mockReturnValueOnce(0.99);

    const first = getReminderContent(customPattern);
    const second = getReminderContent(customPattern);

    expect(first.text).not.toBe(second.text);
    expect(first.text).toBe(`You've been struggling with "Noise". ${templates.cold_start[0].text}`);
    expect(second.text).toBe(
      `You've been struggling with "Noise". ${templates.cold_start.at(-1)!.text}`
    );
  });

  it('uses the generic label when the custom label cannot be resolved', () => {
    mocks.settingValue = '[]';
    vi.spyOn(Math, 'random').mockReturnValue(0);

    expect(getReminderContent(customPattern).text).toBe(
      `You've been struggling with "this distraction". ${templates.cold_start[0].text}`
    );
  });

  it('keeps a cached AI reminder ahead of the fallback for Premium users', () => {
    useAppStore.getState().setPremiumStatus('premium');
    mocks.secureValues.set('ai_cache_custom_noise', JSON.stringify({
      text: 'Fresh AI reminder',
      type: 'attribute',
      timestamp: Date.now(),
    }));

    expect(getReminderContent(customPattern)).toEqual({
      text: 'Fresh AI reminder',
      type: 'attribute',
    });
  });

  it('sends the display-case prayer name and caches a successful AI response', async () => {
    useAppStore.getState().setPremiumStatus('premium');
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ reminder: 'Fresh generated reminder', reminderType: 'short' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(Math, 'random').mockReturnValue(0);

    await generateAIReminder('Noise', 'custom_noise', 'random', 'fajr');

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ prayerName: 'Fajr' });
    expect(JSON.parse(mocks.secureValues.get('ai_cache_custom_noise')!)).toMatchObject({
      text: 'Fresh generated reminder',
      type: 'short',
    });
  });
});
