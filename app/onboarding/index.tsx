import { Image, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Text } from '@/components/ui/Typography';
import { OnboardingFrame } from '@/components/responsive/OnboardingFrame';
import { useResponsiveLayout } from '@/components/responsive/ResponsiveLayout';
import { ChevronRightIcon } from 'react-native-heroicons/outline';

export default function OnboardingIntro() {
  const responsive = useResponsiveLayout();

  return (
    <OnboardingFrame>
      <View className="items-center" style={{ transform: [{ translateY: -10 }] }}>
        <Image
          source={require('../../assets/images/khushu-logo.png')}
          className="rounded-2xl mb-4"
          style={{
            width: responsive.isTablet ? responsive.scaleControl(64) : 56,
            height: responsive.isTablet ? responsive.scaleControl(64) : 56,
          }}
        />
        <Text className="text-3xl font-semibold text-ink-900 tracking-tight">
          Khushu
        </Text>
      </View>

      <View className="items-center gap-y-4">
        <Text className="text-3xl text-ink-900 tracking-tight text-center">
          Bring your heart back to Salah
        </Text>
        <Text className="text-ink-300 text-sm leading-relaxed text-center">
          Build a deeper sense of focus, presence, and connection in your prayers.
        </Text>
      </View>

      <Pressable
        className="bg-sage-500 py-4 rounded-2xl items-center justify-center active:bg-sage-600 relative"
        style={{
          minHeight: responsive.isTablet ? responsive.scaleControl(52) : undefined,
        }}
        onPress={() => router.push('/onboarding/welcome')}
      >
        <Text className="text-pure-white font-semibold text-base text-center">Continue</Text>
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
    </OnboardingFrame>
  );
}
