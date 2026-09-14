import type { ReminderType, SalahName } from '@/types';

const TRACKED_REMINDER_TYPES = new Set<ReminderType>([
  'short',
  'attribute',
  'ayah',
  'hadith',
]);

export function getLastOpenedReminderTypeKey(salah: SalahName): string {
  return `last_opened_reminder_type_${salah}`;
}

function asReminderType(value: string | null | undefined): ReminderType | null {
  return value && TRACKED_REMINDER_TYPES.has(value as ReminderType)
    ? value as ReminderType
    : null;
}

/**
 * Salah Mode attribution must reflect the reminder the user actually saw.
 * A scheduled reminder is only a fallback for logs opened outside Salah Mode.
 */
export function resolveReminderTypeForLog({
  isToday,
  fromSalahMode,
  selectedSalah,
  salahModeSalah,
  lastOpenedReminderType,
  pendingReminderType,
}: {
  isToday: boolean;
  fromSalahMode: boolean;
  selectedSalah: SalahName;
  salahModeSalah: SalahName | null;
  lastOpenedReminderType: string | null | undefined;
  pendingReminderType: string | null | undefined;
}): ReminderType | null {
  if (!isToday) return null;

  if (fromSalahMode) {
    return selectedSalah === salahModeSalah
      ? asReminderType(lastOpenedReminderType)
      : null;
  }

  return asReminderType(pendingReminderType);
}
