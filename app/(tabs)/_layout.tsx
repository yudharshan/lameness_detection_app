import { Tabs } from 'expo-router';
import {
  Activity,
  LayoutDashboard,
  ListOrdered,
  Video,
  type LucideIcon,
} from 'lucide-react-native';
import { View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/theme';

const TAB_HEIGHT = 62;

function TabIcon({
  Icon,
  color,
  focused,
  emphasise = false,
}: {
  Icon: LucideIcon;
  color: ColorValue;
  focused: boolean;
  emphasise?: boolean;
}) {
  if (emphasise) {
    return (
      <View
        className={`items-center justify-center rounded-xl ${
          focused ? 'bg-amber-500' : 'bg-forest-800'
        }`}
        style={{ height: 28, width: 34 }}
      >
        <Icon
          size={17}
          color={focused ? COLORS.forest[950] : COLORS.forest[200]}
          strokeWidth={2.3}
        />
      </View>
    );
  }

  return (
    <View className="items-center justify-center" style={{ height: 28 }}>
      <Icon size={20} color={color} strokeWidth={focused ? 2.4 : 1.9} />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.amber[400],
        tabBarInactiveTintColor: '#7F938A',
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: COLORS.forest[950],
          borderTopWidth: 0,
          height: TAB_HEIGHT + bottomInset,
          paddingTop: 6,
          paddingBottom: bottomInset,
          paddingHorizontal: 6,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          fontSize: 9.5,
          lineHeight: 13,
          fontWeight: '700',
          letterSpacing: 0.3,
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingVertical: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarAccessibilityLabel: 'Herd dashboard',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              Icon={LayoutDashboard}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="passages"
        options={{
          title: 'Passages',
          tabBarAccessibilityLabel: 'Sequential passage stream',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon Icon={ListOrdered} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="upload"
        options={{
          title: 'Capture',
          tabBarAccessibilityLabel: 'Record or upload a walk-through',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              Icon={Video}
              color={color}
              focused={focused}
              emphasise
            />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Explain',
          tabBarAccessibilityLabel: 'Biomechanical explainability',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon Icon={Activity} color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
