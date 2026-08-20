import { ActivityIndicator, Modal, Pressable, View } from 'react-native';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from 'react-native-heroicons/outline';
import { Text } from './Typography';
import { useThemeColors } from '@/lib/theme/colors';

export type AppDialogTone = 'info' | 'success' | 'warning' | 'destructive';
export type AppDialogActionTone = 'primary' | 'secondary' | 'destructive';

export type AppDialogAction = {
  label: string;
  onPress: () => void;
  tone?: AppDialogActionTone;
  loading?: boolean;
  disabled?: boolean;
};

type AppDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  actions: AppDialogAction[];
  actionLayout?: 'auto' | 'horizontal' | 'vertical';
  tone?: AppDialogTone;
  onDismiss: () => void;
  showIcon?: boolean;
};

const toneStyles = {
  info: { Icon: InformationCircleIcon, icon: '#5A7A5A', circle: 'bg-sand-100' },
  success: { Icon: CheckCircleIcon, icon: '#5A7A5A', circle: 'bg-sand-100' },
  warning: { Icon: ExclamationTriangleIcon, icon: '#B98535', circle: 'bg-sand-100' },
  destructive: { Icon: ExclamationTriangleIcon, icon: '#DC5A5A', circle: 'bg-red-50' },
} as const;

const actionStyles: Record<AppDialogActionTone, { button: string; text: string; spinner: string }> = {
  primary: { button: 'bg-sage-600 active:bg-sage-700', text: 'text-pure-white', spinner: '#FFFFFF' },
  secondary: { button: 'bg-sand-200 active:bg-sand-300', text: 'text-ink-700', spinner: '#3A3633' },
  destructive: { button: 'bg-red-500 active:opacity-80', text: 'text-pure-white', spinner: '#FFFFFF' },
};

export function AppDialog({
  visible,
  title,
  message,
  actions,
  actionLayout = 'auto',
  tone = 'info',
  onDismiss,
  showIcon = true,
}: AppDialogProps) {
  const theme = useThemeColors();
  const { Icon, icon, circle } = toneStyles[tone];
  const horizontalActions = actionLayout === 'horizontal'
    || (actionLayout === 'auto' && actions.length === 2);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onDismiss}
    >
      <Pressable
        accessibilityRole="none"
        className="flex-1 bg-black/40 items-center justify-center px-6"
        onPress={onDismiss}
      >
        <Pressable
          accessibilityViewIsModal
          className="bg-white border border-sand-200 rounded-3xl px-6 pt-6 pb-5 w-full max-w-sm"
          style={{
            shadowColor: '#1A1917',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.16,
            shadowRadius: 24,
            elevation: 12,
          }}
          onPress={(event) => event.stopPropagation()}
        >
          {showIcon && (
            <View className={`w-12 h-12 rounded-full ${circle} items-center justify-center self-center mb-4`}>
              <Icon size={24} color={icon} />
            </View>
          )}

          <Text className="text-ink-900 text-lg font-semibold text-center mb-2">
            {title}
          </Text>
          <Text className="text-ink-400 text-sm leading-relaxed text-center mb-6">
            {message}
          </Text>

          <View className={horizontalActions ? 'flex-row gap-x-3' : 'gap-y-3'}>
            {actions.map((action) => {
              const actionTone = action.tone ?? 'primary';
              const styles = actionStyles[actionTone];
              return (
                <Pressable
                  key={action.label}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: action.disabled || action.loading }}
                  disabled={action.disabled || action.loading}
                  onPress={action.onPress}
                  className={`${horizontalActions ? 'flex-1' : 'w-full'} min-h-12 px-3 py-3 rounded-2xl items-center justify-center ${styles.button} ${action.disabled ? 'opacity-50' : ''}`}
                >
                  {action.loading
                    ? <ActivityIndicator color={actionTone === 'secondary' ? theme.textSecondary : styles.spinner} />
                    : <Text className={`${styles.text} text-sm font-semibold text-center`}>{action.label}</Text>}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
