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
import { colors, shadows } from '@/src/theme/colors';

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
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingVertical: 28 }} keyboardShouldPersistTaps="handled">
        <View style={{ flex: 1, justifyContent: 'center', gap: 18 }}>
          <View style={{ gap: 12 }}>
            <View style={{ alignSelf: 'flex-start', borderRadius: 999, backgroundColor: colors.primarySoft, paddingHorizontal: 12, paddingVertical: 7 }}>
              <Text style={{ color: colors.primaryDark, fontSize: 11, fontWeight: '700' }}>SUB2API MOBILE</Text>
            </View>
            <Text style={{ fontSize: 34, lineHeight: 39, fontWeight: '800', color: colors.text }}>连接管理后台</Text>
            <Text style={{ fontSize: 14, lineHeight: 22, color: colors.muted }}>
              查看 Sub2API 的流量、账号、用户、分组和代理池状态。
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, paddingTop: 2 }}>
              <View style={{ borderRadius: 999, backgroundColor: colors.tealSoft, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ color: colors.teal, fontSize: 11, fontWeight: '700' }}>只连你的服务器</Text>
              </View>
              <View style={{ borderRadius: 999, backgroundColor: colors.slateSoft, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ color: colors.textSoft, fontSize: 11, fontWeight: '700' }}>SecureStore 保存</Text>
              </View>
            </View>
          </View>

          <View style={{ backgroundColor: colors.surface, borderRadius: 22, padding: 18, gap: 16, borderWidth: 1, borderColor: colors.border, boxShadow: shadows.card }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>服务器信息</Text>
              <View style={{ borderRadius: 999, backgroundColor: colors.successSoft, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ color: colors.success, fontSize: 11, fontWeight: '700' }}>本地加密</Text>
              </View>
            </View>
            <View>
              <Text style={{ marginBottom: 8, fontSize: 12, fontWeight: '700', color: colors.textSoft }}>服务器地址</Text>
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
                    placeholderTextColor={colors.faint}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{ backgroundColor: colors.surfaceSoft, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 15, fontSize: 16, color: colors.text }}
                  />
                )}
              />
            </View>

            <View>
              <Text style={{ marginBottom: 8, fontSize: 12, fontWeight: '700', color: colors.textSoft }}>Admin Key</Text>
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
                      placeholderTextColor={colors.faint}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry={!showAdminKey}
                      style={{
                        flex: 1,
                        backgroundColor: colors.surfaceSoft,
                        borderRadius: 14,
                        paddingHorizontal: 16,
                        paddingVertical: 15,
                        fontSize: 16,
                        color: colors.text,
                      }}
                    />
                    <Pressable
                      onPress={() => setShowAdminKey((value) => !value)}
                      style={{ backgroundColor: colors.primarySoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11 }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primaryDark }}>{showAdminKey ? '隐藏' : '显示'}</Text>
                    </Pressable>
                  </View>
                )}
              />
            </View>

            {formState.errors.baseUrl || formState.errors.adminApiKey ? (
              <View style={{ borderRadius: 14, backgroundColor: colors.dangerSoft, paddingHorizontal: 14, paddingVertical: 12 }}>
                <Text style={{ color: colors.danger, fontSize: 14 }}>{formState.errors.baseUrl?.message || formState.errors.adminApiKey?.message}</Text>
              </View>
            ) : null}

            {connectionMessage ? (
              <View style={{ borderRadius: 14, backgroundColor: colors.dangerSoft, paddingHorizontal: 14, paddingVertical: 12 }}>
                <Text style={{ color: colors.danger, fontSize: 14 }}>{connectionMessage}</Text>
              </View>
            ) : null}

            <Pressable
              style={{ backgroundColor: connectionState === 'checking' ? '#93a4b7' : colors.primary, borderRadius: 15, paddingVertical: 16, alignItems: 'center' }}
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
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>{connectionState === 'checking' ? '连接中...' : '进入控制台'}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
