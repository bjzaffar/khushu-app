import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowTrendingUpIcon, Cog6ToothIcon, HomeIcon, PencilSquareIcon } from 'react-native-heroicons/outline';
import { ArrowTrendingUpIcon as ArrowTrendingUpSolidIcon, Cog6ToothIcon as Cog6ToothSolidIcon, HomeIcon as HomeSolidIcon, PencilSquareIcon as PencilSquareSolidIcon } from 'react-native-heroicons/solid';
import { useAppStore } from '@/store/appStore';

function TabBarBackground() {
  return (
    <View
      className="absolute inset-0 bg-sand-50 border-t border-sand-200"
      pointerEvents="none"
    />
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: 'transparent' },
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 8,
          height: 64 + insets.bottom,
        },
        tabBarBackground: () => <TabBarBackground />,
        tabBarActiveTintColor: '#5A7A5A',
        tabBarInactiveTintColor: '#9B9189',
        tabBarLabelStyle: {
          fontFamily: 'PlusJakartaSans_500Medium',
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              useAppStore.getState().requestHomeTabReselection();
            }
          },
        })}
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => focused ? <HomeSolidIcon size={20} color={color} /> : <HomeIcon size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="log"
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              useAppStore.getState().requestLogTabReselection();
            }
          },
        })}
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
