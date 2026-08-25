import { forwardRef } from 'react';
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from 'react-native';
import { useResponsiveLayout } from '@/components/responsive/ResponsiveLayout';
import {
  APP_MAX_FONT_SIZE_MULTIPLIER,
  resolveResponsiveTypography,
} from '@/lib/responsive/typography';

type TypographyProps = {
  className?: string;
  responsive?: boolean;
};

const fontFamilies = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
} as const;

function fontFamilyFor(fontWeight: TextStyle['fontWeight'], className?: string) {
  const classWeight = className?.match(/(?:^|\s)font-(medium|semibold|bold)(?:\s|$)/)?.[1];
  const weight = fontWeight ?? classWeight;

  if (weight === 'bold' || weight === '700' || weight === '800' || weight === '900') {
    return fontFamilies.bold;
  }
  if (weight === '600') return fontFamilies.semibold;
  if (weight === '500') return fontFamilies.medium;
  if (weight === 'medium') return fontFamilies.medium;
  if (weight === 'semibold') return fontFamilies.semibold;

  return fontFamilies.regular;
}

function resolveFontFamily(style: TextProps['style'], className?: string) {
  return fontFamilyFor(StyleSheet.flatten(style)?.fontWeight, className);
}

export const Text = forwardRef<NativeText, TextProps & TypographyProps>(
  ({ style, className, responsive = true, maxFontSizeMultiplier, ...props }, ref) => {
    const layout = useResponsiveLayout();
    const flattened = StyleSheet.flatten(style);
    const responsiveStyle = responsive && layout.isTablet
      ? resolveResponsiveTypography(
        className,
        flattened?.fontSize,
        flattened?.lineHeight,
        layout.scaleFont,
      )
      : undefined;

    return (
      <NativeText
        ref={ref}
        {...props}
        maxFontSizeMultiplier={maxFontSizeMultiplier ?? APP_MAX_FONT_SIZE_MULTIPLIER}
        className={className}
        style={[style, responsiveStyle, { fontFamily: resolveFontFamily(style, className) }]}
      />
    );
  }
);

Text.displayName = 'Text';

export const TextInput = forwardRef<NativeTextInput, TextInputProps & TypographyProps>(
  ({ style, className, responsive = true, maxFontSizeMultiplier, ...props }, ref) => {
    const layout = useResponsiveLayout();
    const flattened = StyleSheet.flatten(style);
    const responsiveStyle = responsive && layout.isTablet
      ? resolveResponsiveTypography(
        className,
        flattened?.fontSize,
        flattened?.lineHeight,
        layout.scaleFont,
      )
      : undefined;

    return (
      <NativeTextInput
        ref={ref}
        {...props}
        maxFontSizeMultiplier={maxFontSizeMultiplier ?? APP_MAX_FONT_SIZE_MULTIPLIER}
        className={className}
        style={[style, responsiveStyle, { fontFamily: resolveFontFamily(style, className) }]}
      />
    );
  }
);

TextInput.displayName = 'TextInput';
