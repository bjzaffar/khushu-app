import { Tabs } from 'expo-router';
import { Text } from '@/components/ui/Typography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowTrendingUpIcon, Cog6ToothIcon, HomeIcon, PencilSquareIcon } from 'react-native-heroicons/outline';
import { ArrowTrendingUpIcon as ArrowTrendingUpSolidIcon, Cog6ToothIcon as Cog6ToothSolidIcon, HomeIcon as HomeSolidIcon, PencilSquareIcon as PencilSquareSolidIcon } from 'react-native-heroicons/solid';

function TabIcon({ focused, label }: { focused: boolean; label: string }) {
  return (
    <Text className={`text-xs mt-1 ${focused ? 'text-sage-600 font-semibold' : 'text-ink-300'}`}>
      {label}
    </Text>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#FAF7F2',
          borderTopColor: '#EFE8D8',
          borderTopWidth: 1,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 8,
          height: 64 + insets.bottom,
        },
        tabBarActiveTintColor: '#5A7A5A',
        tabBarInactiveTintColor: '#9B9189',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => focused ? <HomeSolidIcon size={20} color={color} /> : <HomeIcon size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: 'Log',
          tabBarIcon: ({ color, focused }) => focused ? <PencilSquareSolidIcon size={20} color={color} /> : <PencilSquareIcon size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ color, focused }) => focused ? <ArrowTrendingUpSolidIcon size={20} color={color} /> : <ArrowTrendingUpIcon size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => focused ? <Cog6ToothSolidIcon size={20} color={color} /> : <Cog6ToothIcon size={20} color={color} />,
        }}
      />
    </Tabs>
  );
}
