import { useEffect, useRef } from 'react';
import { View, Animated, Easing, Image } from 'react-native';
import { useThemeColors } from '@/lib/theme/colors';

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const theme = useThemeColors();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['20%', '100%'],
  });

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
      <Image
        source={require('../assets/images/khushu-logo.png')}
        style={{ width: 200, height: 200, borderRadius: 40 }}
        resizeMode="contain"
      />
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4 }}>
        <Animated.View style={{ height: '100%', width, backgroundColor: '#6B8F6B' }} />
      </View>
    </View>
  );
}
