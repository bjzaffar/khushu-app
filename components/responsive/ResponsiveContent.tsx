import type { PropsWithChildren } from 'react';
import { View, type ViewProps, type ViewStyle } from 'react-native';
import type { ResponsiveMaxWidth } from '@/lib/responsive/metrics';
import { useResponsiveLayout } from './ResponsiveLayout';

type ResponsiveContentProps = PropsWithChildren<ViewProps & {
  kind?: ResponsiveMaxWidth;
  padded?: boolean;
  phoneGutter?: number;
}>;

export function ResponsiveContent({
  children,
  kind = 'primary',
  padded = true,
  phoneGutter,
  style,
  ...props
}: ResponsiveContentProps) {
  const responsive = useResponsiveLayout();
  const defaultPhoneGutter = kind === 'primary' ? 20 : 24;
  const horizontalPadding = responsive.isTablet
    ? responsive.gutter
    : (phoneGutter ?? defaultPhoneGutter);
  const responsiveStyle: ViewStyle = {
    alignSelf: 'center',
    width: '100%',
    maxWidth: responsive.maxWidths[kind],
    paddingHorizontal: padded ? horizontalPadding : 0,
  };

  return (
    <View {...props} style={[responsiveStyle, style]}>
      {children}
    </View>
  );
}
