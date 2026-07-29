import { forwardRef } from 'react';
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from 'react-native';

type TypographyProps = { className?: string };

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
  ({ style, className, ...props }, ref) => (
    <NativeText
      ref={ref}
      {...props}
      className={className}
      style={[style, { fontFamily: resolveFontFamily(style, className) }]}
    />
  )
);

Text.displayName = 'Text';

export const TextInput = forwardRef<NativeTextInput, TextInputProps & TypographyProps>(
  ({ style, className, ...props }, ref) => (
    <NativeTextInput
      ref={ref}
      {...props}
      className={className}
      style={[style, { fontFamily: resolveFontFamily(style, className) }]}
    />
  )
);

TextInput.displayName = 'TextInput';
