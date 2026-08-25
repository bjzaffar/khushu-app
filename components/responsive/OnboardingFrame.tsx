import type { PropsWithChildren } from 'react';
import { ScrollView, type ScrollViewProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResponsiveContent } from './ResponsiveContent';
import { useResponsiveLayout } from './ResponsiveLayout';

type OnboardingFrameProps = PropsWithChildren<{
  scrollProps?: Omit<ScrollViewProps, 'contentContainerStyle'>;
  contentStyle?: ViewStyle;
}>;

export function OnboardingFrame({ children, scrollProps, contentStyle }: OnboardingFrameProps) {
  const responsive = useResponsiveLayout();
  const preservePhoneLayout = !responsive.isTablet && responsive.breakpoint !== 'compact';

  return (
    <SafeAreaView className="flex-1 bg-sand-100">
      <ScrollView
        {...scrollProps}
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <ResponsiveContent
          kind="form"
          phoneGutter={28}
          style={[
            {
              flexGrow: 1,
              justifyContent: preservePhoneLayout ? 'space-between' : 'center',
              paddingTop: preservePhoneLayout ? 56 : responsive.scaleSpacing(32),
              paddingBottom: preservePhoneLayout ? 56 : responsive.scaleSpacing(32),
              rowGap: preservePhoneLayout ? 0 : responsive.scaleSpacing(48),
            },
            contentStyle,
          ]}
        >
          {children}
        </ResponsiveContent>
      </ScrollView>
    </SafeAreaView>
  );
}
