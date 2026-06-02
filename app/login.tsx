import { Redirect, router } from 'expo-router';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { getAdminSettings, getDashboardStats } from '@/src/services/admin';
import { queryClient } from '@/src/lib/query-client';
import { adminConfigState, hasAuthenticatedAdminSession, saveAdminConfig } from '@/src/store/admin-config';

const { useSnapshot } = require('valtio/react');

const schema = z
  .object({
    baseUrl: z.string().min(1, '请输入服务器地址'),
    adminApiKey: z.string(),
  })
  .refine((values) => values.adminApiKey.trim().length > 0, {
    path: ['adminApiKey'],
    message: '请输入 Admin Key',
  });

type FormValues = z.infer<typeof schema>;
type ConnectionState = 'idle' | 'checking' | 'error';

const colors = {
  page: '#0f172a',
  card: '#ffffff',
  mutedCard: '#eef2ff',
  primary: '#7c3aed',
  text: '#0f172a',
  subtext: '#c7d2fe',
  border: '#c4b5fd',
  dangerBg: '#ffe4e6',
  danger: '#be123c',
  cyan: '#22d3ee',
  pink: '#ec4899',
};

function getConnectionErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    switch (error.message) {
      case 'BASE_URL_REQUIRED':
        return '请先填写服务器地址。';
      case 'ADMIN_API_KEY_REQUIRED':
        return '请先填写 Admin Key。';
      case 'INVALID_SERVER_RESPONSE':
        return '当前地址返回的数据不正确，请确认它是可用的管理接口。';
      default:
        return error.message;
    }
  }

  return '连接失败，请检查服务器地址、Admin Key 和网络连通性。';
}

export default function LoginScreen() {
  const config = useSnapshot(adminConfigState);
  const hasAccount = hasAuthenticatedAdminSession(config);
  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      baseUrl: config.baseUrl,
      adminApiKey: config.adminApiKey,
    },
  });
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [showAdminKey, setShowAdminKey] = useState(false);

  if (hasAccount) {
    return <Redirect href="/monitor" />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingVertical: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ flex: 1, justifyContent: 'center', gap: 18 }}>
          <View style={{ gap: 14 }}>
            <View style={{ alignSelf: 'flex-start', borderRadius: 999, backgroundColor: '#312e81', paddingHorizontal: 12, paddingVertical: 7 }}>
              <Text style={{ color: colors.cyan, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 }}>SUB2API MOBILE</Text>
            </View>
            <Text style={{ fontSize: 40, lineHeight: 44, fontWeight: '900', color: '#f8fafc' }}>Admin{'\n'}Cockpit</Text>
            <Text style={{ fontSize: 14, lineHeight: 22, color: colors.subtext }}>
              连接你的 Sub2API 管理端，查看流量、账号、用户和代理池状态。
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ height: 5, width: 60, borderRadius: 999, backgroundColor: colors.cyan }} />
              <View style={{ height: 5, width: 34, borderRadius: 999, backgroundColor: colors.pink }} />
              <View style={{ height: 5, width: 22, borderRadius: 999, backgroundColor: '#a3e635' }} />
            </View>
          </View>

          <View style={{ backgroundColor: colors.card, borderRadius: 26, padding: 18, gap: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: colors.text }}>连接服务器</Text>
              <View style={{ borderRadius: 999, backgroundColor: '#f0f9ff', paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ color: '#0369a1', fontSize: 11, fontWeight: '800' }}>SecureStore</Text>
              </View>
            </View>
            <View>
              <Text style={{ marginBottom: 8, fontSize: 12, fontWeight: '800', color: '#475569' }}>服务器地址</Text>
              <Controller
                control={control}
                name="baseUrl"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    value={value}
                    onChangeText={(text) => {
                      if (connectionState !== 'idle') {
                        setConnectionState('idle');
                        setConnectionMessage('');
                      }
                      onChange(text);
                    }}
                    placeholder="例如：https://api.example.com"
                    placeholderTextColor="#9b9081"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{ backgroundColor: colors.mutedCard, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 15, fontSize: 16, color: colors.text }}
                  />
                )}
              />
            </View>

            <View>
              <Text style={{ marginBottom: 8, fontSize: 12, fontWeight: '800', color: '#475569' }}>Admin Key</Text>
              <Controller
                control={control}
                name="adminApiKey"
                render={({ field: { onChange, value } }) => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TextInput
                      value={value}
                      onChangeText={(text) => {
                        if (connectionState !== 'idle') {
                          setConnectionState('idle');
                          setConnectionMessage('');
                        }
                        onChange(text);
                      }}
                      placeholder="admin-xxxxxxxx"
                      placeholderTextColor="#9b9081"
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry={!showAdminKey}
                      style={{
                        flex: 1,
                        backgroundColor: colors.mutedCard,
                        borderRadius: 18,
                        paddingHorizontal: 16,
                        paddingVertical: 15,
                        fontSize: 16,
                        color: colors.text,
                      }}
                    />
                    <Pressable
                      onPress={() => setShowAdminKey((value) => !value)}
                      style={{ backgroundColor: '#ede9fe', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11 }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#6d28d9' }}>{showAdminKey ? '隐藏' : '显示'}</Text>
                    </Pressable>
                  </View>
                )}
              />
            </View>

            {formState.errors.baseUrl || formState.errors.adminApiKey ? (
              <View style={{ borderRadius: 14, backgroundColor: colors.dangerBg, paddingHorizontal: 14, paddingVertical: 12 }}>
                <Text style={{ color: colors.danger, fontSize: 14 }}>{formState.errors.baseUrl?.message || formState.errors.adminApiKey?.message}</Text>
              </View>
            ) : null}

            {connectionMessage ? (
              <View style={{ borderRadius: 14, backgroundColor: colors.dangerBg, paddingHorizontal: 14, paddingVertical: 12 }}>
                <Text style={{ color: colors.danger, fontSize: 14 }}>{connectionMessage}</Text>
              </View>
            ) : null}

            <Pressable
              style={{ backgroundColor: connectionState === 'checking' ? '#a78bfa' : colors.primary, borderRadius: 20, paddingVertical: 16, alignItems: 'center' }}
              disabled={connectionState === 'checking'}
              onPress={handleSubmit(async (values) => {
                setConnectionState('checking');
                setConnectionMessage('正在验证服务器连接...');

                try {
                  await saveAdminConfig(values);
                  queryClient.clear();
                  await queryClient.fetchQuery({ queryKey: ['admin-settings'], queryFn: getAdminSettings });
                  await queryClient.prefetchQuery({ queryKey: ['monitor-stats'], queryFn: getDashboardStats });
                  router.replace('/monitor');
                } catch (error) {
                  setConnectionState('error');
                  setConnectionMessage(getConnectionErrorMessage(error));
                }
              })}
            >
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900' }}>{connectionState === 'checking' ? '连接中...' : '进入控制台'}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
