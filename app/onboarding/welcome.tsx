import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { router } from 'expo-router';
import { ArrowTrendingUpIcon, ChevronRightIcon, PencilSquareIcon, SunIcon } from 'react-native-heroicons/outline';
import type { ReactNode } from 'react';
import { OnboardingFrame } from '@/components/responsive/OnboardingFrame';
import { useResponsiveLayout } from '@/components/responsive/ResponsiveLayout';

export default function OnboardingWelcome() {
  const responsive = useResponsiveLayout();

  return (
    <OnboardingFrame>
        <View className="gap-y-10">
          {/* Top — introduction */}
          <View className="items-center gap-y-4">
            <Text className="text-3xl text-ink-900 tracking-tight text-center">
              Small reflections. Deeper focus.
            </Text>
          </View>

          {/* Features */}
          <View className="gap-y-6">
            <OnboardingPoint
              icon={<PencilSquareIcon size={responsive.scaleControl(24)} color="#5A7A5A" />}
              title="Reflect after each Salah"
              body="Rate your focus, note what pulled you away. No judgment — just awareness."
            />
            <OnboardingPoint
              icon={<ArrowTrendingUpIcon size={responsive.scaleControl(24)} color="#5A7A5A" />}
              title="Discover your patterns"
              body="Over time, the app learns when and why your mind wanders — without fabricating anything."
            />
            <OnboardingPoint
              icon={<SunIcon size={responsive.scaleControl(24)} color="#5A7A5A" />}
              title="Receive gentle reminders"
              body="Before each Salah, a quiet prompt to help you arrive fully present."
            />
          </View>
        </View>

        {/* Bottom — CTA */}
        <View className="gap-y-3">
          <Pressable
            className="bg-sage-500 py-4 rounded-2xl items-center justify-center active:bg-sage-600 relative"
            style={{
              minHeight: responsive.isTablet ? responsive.scaleControl(52) : undefined,
            }}
            onPress={() => router.push('/onboarding/location')}
          >
            <Text className="text-pure-white font-semibold text-base text-center">Get Started</Text>
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                alignItems: 'flex-end',
                justifyContent: 'center',
                paddingRight: 12,
              }}
            >
              <ChevronRightIcon size={responsive.scaleControl(20)} color="white" />
            </View>
          </Pressable>
        </View>
    </OnboardingFrame>
  );
}

function OnboardingPoint({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <View className="flex-row gap-x-4 items-start">
      <View className="mt-0.5">{icon}</View>
      <View className="flex-1">
        <Text className="text-ink-700 font-semibold text-base mb-1">{title}</Text>
        <Text className="text-ink-300 text-sm leading-relaxed">{body}</Text>
      </View>
    </View>
  );
}
