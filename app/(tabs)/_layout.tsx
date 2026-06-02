import { Redirect, Tabs } from 'expo-router';
import { ChartNoAxesCombined, Network, Settings2, Users } from 'lucide-react-native';

import { adminConfigState, hasAuthenticatedAdminSession } from '@/src/store/admin-config';

const { useSnapshot } = require('valtio/react');

export default function TabsLayout() {
  const config = useSnapshot(adminConfigState);
  const hasAccount = hasAuthenticatedAdminSession(config);

  if (!hasAccount) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      initialRouteName={hasAccount ? 'monitor' : 'settings'}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#67e8f9',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          backgroundColor: '#0f172a',
          borderTopWidth: 0,
          height: 88,
          paddingTop: 10,
          paddingBottom: 18,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="monitor"
        options={{
          title: '概览',
          tabBarIcon: ({ color, size }) => <ChartNoAxesCombined color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          title: '用户',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="proxies"
        options={{
          title: '代理池',
          tabBarIcon: ({ color, size }) => <Network color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '服务器',
          tabBarIcon: ({ color, size }) => <Settings2 color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="groups" options={{ href: null }} />
      <Tabs.Screen name="accounts" options={{ href: null }} />
    </Tabs>
  );
}
