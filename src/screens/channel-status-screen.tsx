import { useQueries, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Activity, Bot, Gauge, Globe2, Play, RefreshCw, Signal, Zap } from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getChannelMonitorHistory, listChannelMonitors, runChannelMonitor } from '@/src/services/admin';
import { adminConfigState, hasAuthenticatedAdminSession } from '@/src/store/admin-config';
import { chartColors, colors, shadows } from '@/src/theme/colors';
import type { ChannelMonitor, ChannelMonitorHistoryItem } from '@/src/types/admin';

const { useSnapshot } = require('valtio/react');

type ChannelWindowKey = '7d' | '15d' | '30d';

const CHANNEL_WINDOW_OPTIONS: Array<{ key: ChannelWindowKey; label: string }> = [
  { key: '7d', label: '7天' },
  { key: '15d', label: '15天' },
  { key: '30d', label: '30天' },
];

function getProviderLabel(provider?: string) {
  switch ((provider ?? '').toLowerCase()) {
    case 'openai':
      return 'OpenAI';
    case 'anthropic':
      return 'Anthropic';
    case 'gemini':
      return 'Gemini';
    default:
      return provider || 'Unknown';
  }
}

function getStatusLabel(status?: string) {
  switch ((status ?? '').toLowerCase()) {
    case 'operational':
      return '正常';
    case 'degraded':
      return '波动';
    case 'failed':
      return '失败';
    case 'error':
      return '异常';
    default:
      return status || '未知';
  }
}

function getStatusStyle(status?: string) {
  switch ((status ?? '').toLowerCase()) {
    case 'operational':
      return { text: colors.success, bg: colors.successSoft, bar: '#10b981', height: 1 };
    case 'degraded':
      return { text: colors.warning, bg: colors.warningSoft, bar: chartColors.amber, height: 0.72 };
    case 'failed':
    case 'error':
      return { text: colors.danger, bg: colors.dangerSoft, bar: chartColors.rose, height: 0.42 };
    default:
      return { text: colors.muted, bg: colors.surfaceSoft, bar: colors.borderStrong, height: 0.26 };
  }
}

function getProviderAccent(provider?: string) {
  switch ((provider ?? '').toLowerCase()) {
    case 'openai':
      return { fg: '#059669', bg: '#d1fae5' };
    case 'anthropic':
      return { fg: '#c2410c', bg: '#ffedd5' };
    case 'gemini':
      return { fg: '#0284c7', bg: '#e0f2fe' };
    default:
      return { fg: colors.textSoft, bg: colors.surfaceSoft };
  }
}

function formatNumber(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return new Intl.NumberFormat('en-US').format(value);
}

function formatLatencyValue(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return String(Math.round(value));
}

function formatAvailabilityValue(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return `${value.toFixed(2)}%`;
}

function formatTime(value?: string | null) {
  if (!value) return '更新时间未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '更新时间未知';
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getAvailabilityValue(monitor: ChannelMonitor, windowKey: ChannelWindowKey) {
  if (windowKey === '7d') return monitor.availability_7d ?? null;
  if (windowKey === '15d') return monitor.availability_15d ?? null;
  return monitor.availability_30d ?? null;
}

function getLatestHistory(monitor: ChannelMonitor, history: ChannelMonitorHistoryItem[]) {
  return history.find((item) => item.model === monitor.primary_model) ?? history[0];
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    switch (error.message) {
      case 'BASE_URL_REQUIRED':
        return '请先去服务器页填写服务地址。';
      case 'ADMIN_API_KEY_REQUIRED':
        return '请先去服务器页填写 Admin Token。';
      case 'INVALID_SERVER_RESPONSE':
        return '当前服务返回的数据格式不正确，请确认它是可用的 Sub2API 管理接口。';
      default:
        return error.message;
    }
  }

  return '当前无法加载渠道状态，请检查服务地址、Token 和网络。';
}

function MetricBox({
  icon,
  label,
  value,
  unit,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <View style={{ flex: 1, minWidth: 0, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.76)', borderWidth: 1, borderColor: colors.border, padding: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon}
        <Text style={{ fontSize: 10, fontWeight: '800', color: colors.faint }}>{label}</Text>
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ marginTop: 8, fontSize: 19, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] }}>
        {value}
        <Text style={{ fontSize: 10, color: colors.muted }}> {unit}</Text>
      </Text>
    </View>
  );
}

function SummaryPill({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: 'blue' | 'green' | 'amber' }) {
  const palette = tone === 'green'
    ? { bg: colors.successSoft, fg: colors.success }
    : tone === 'amber'
      ? { bg: colors.warningSoft, fg: colors.warning }
      : { bg: colors.primarySoft, fg: colors.primary };

  return (
    <View style={{ flex: 1, minWidth: 0, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 13, boxShadow: shadows.subtle }}>
      <View style={{ width: 30, height: 30, borderRadius: 11, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </View>
      <Text style={{ marginTop: 10, fontSize: 11, color: colors.muted }}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ marginTop: 4, fontSize: 20, fontWeight: '900', color: palette.fg, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );
}

function ChannelTimeline({ history }: { history: ChannelMonitorHistoryItem[] }) {
  const visibleHistory = history.slice(0, 60).reverse();
  const placeholders = Array.from({ length: Math.max(0, 60 - visibleHistory.length) });
  const bars = [
    ...placeholders.map((_, index) => ({ key: `empty-${index}`, status: 'empty' })),
    ...visibleHistory.map((item) => ({ key: String(item.id), status: item.status })),
  ];

  return (
    <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ fontSize: 10, fontWeight: '800', color: colors.faint }}>近 60 次记录</Text>
        <Text style={{ fontSize: 10, fontWeight: '800', color: colors.faint }}>NOW</Text>
      </View>
      <View style={{ width: '100%', height: 24, flexDirection: 'row', alignItems: 'flex-end', gap: 1, overflow: 'hidden' }}>
        {bars.map((bar) => {
          const style = getStatusStyle(bar.status);
          return (
            <View
              key={bar.key}
              style={{
                flexGrow: 1,
                flexShrink: 1,
                flexBasis: 0,
                minWidth: 0,
                height: Math.max(5, Math.round(24 * style.height)),
                borderRadius: 2,
                backgroundColor: style.bar,
              }}
            />
          );
        })}
      </View>
      <View style={{ marginTop: 4, flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 9, fontWeight: '700', color: colors.faint }}>PAST</Text>
        <Text style={{ fontSize: 9, fontWeight: '700', color: colors.faint }}>NOW</Text>
      </View>
    </View>
  );
}

function ChannelMonitorCard({
  monitor,
  history,
  windowKey,
  running,
  onRun,
}: {
  monitor: ChannelMonitor;
  history: ChannelMonitorHistoryItem[];
  windowKey: ChannelWindowKey;
  running: boolean;
  onRun: () => void;
}) {
  const latest = getLatestHistory(monitor, history);
  const status = monitor.primary_status || latest?.status;
  const statusStyle = getStatusStyle(status);
  const providerAccent = getProviderAccent(monitor.provider);
  const availability = getAvailabilityValue(monitor, windowKey);
  const latency = latest?.latency_ms ?? monitor.primary_latency_ms;
  const pingLatency = latest?.ping_latency_ms;

  return (
    <View style={{ borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 16, boxShadow: '0 14px 28px rgba(15, 23, 42, 0.08)', overflow: 'hidden' }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: statusStyle.bar }} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flexDirection: 'row', flex: 1, gap: 11, minWidth: 0 }}>
          <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: providerAccent.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Bot color={providerAccent.fg} size={20} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>
              {monitor.name}
            </Text>
            <View style={{ marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <View style={{ borderRadius: 7, backgroundColor: providerAccent.bg, paddingHorizontal: 7, paddingVertical: 3 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: providerAccent.fg }}>{getProviderLabel(monitor.provider)}</Text>
              </View>
              <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0, fontSize: 11, color: colors.muted }}>
                {monitor.primary_model}
              </Text>
            </View>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 8 }}>
          <View style={{ borderRadius: 999, backgroundColor: statusStyle.bg, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: statusStyle.text }}>{getStatusLabel(status)}</Text>
          </View>
          <Pressable
            onPress={onRun}
            disabled={running}
            style={{ minWidth: 78, height: 34, borderRadius: 12, backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, opacity: running ? 0.55 : 1 }}
          >
            <RefreshCw color={colors.textSoft} size={15} />
            <Text style={{ color: colors.textSoft, fontSize: 12, fontWeight: '800' }}>{running ? '检测中' : '检测'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <MetricBox icon={<Zap color={colors.faint} size={13} />} label="对话延迟" value={formatLatencyValue(latency)} unit="ms" />
        <MetricBox icon={<Globe2 color={colors.faint} size={13} />} label="端点 PING" value={formatLatencyValue(pingLatency)} unit="ms" />
      </View>

      <View style={{ marginTop: 16, paddingTop: 13, borderTopWidth: 1, borderTopColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 11, color: colors.muted }}>可用性 · {CHANNEL_WINDOW_OPTIONS.find((item) => item.key === windowKey)?.label}</Text>
            <Text numberOfLines={1} style={{ marginTop: 6, fontSize: 11, color: colors.faint }}>最近更新 {formatTime(latest?.checked_at ?? monitor.last_checked_at)}</Text>
          </View>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ maxWidth: 128, fontSize: 31, lineHeight: 34, fontWeight: '900', color: typeof availability === 'number' ? statusStyle.text : colors.faint, fontVariant: ['tabular-nums'] }}>
            {formatAvailabilityValue(availability)}
          </Text>
        </View>
      </View>

      <ChannelTimeline history={history} />
    </View>
  );
}

export default function ChannelStatusScreen() {
  const config = useSnapshot(adminConfigState);
  const hasAccount = hasAuthenticatedAdminSession(config);
  const [channelWindow, setChannelWindow] = useState<ChannelWindowKey>('7d');
  const [runningMonitorIds, setRunningMonitorIds] = useState<number[]>([]);

  const channelMonitorsQuery = useQuery({
    queryKey: ['channel-monitors'],
    queryFn: listChannelMonitors,
    enabled: hasAccount,
    staleTime: 60_000,
  });
  const channelMonitors = useMemo(() => channelMonitorsQuery.data?.items ?? [], [channelMonitorsQuery.data?.items]);
  const channelHistoryQueries = useQueries({
    queries: channelMonitors.map((monitor) => ({
      queryKey: ['channel-monitor-history', monitor.id],
      queryFn: () => getChannelMonitorHistory(monitor.id),
      enabled: hasAccount,
      staleTime: 60_000,
    })),
  });

  const channelHistoryById = useMemo(() => {
    const result: Record<number, ChannelMonitorHistoryItem[]> = {};
    channelHistoryQueries.forEach((query, index) => {
      const monitor = channelMonitors[index];
      if (monitor) {
        result[monitor.id] = query.data?.items ?? [];
      }
    });
    return result;
  }, [channelHistoryQueries, channelMonitors]);

  const unhealthyCount = channelMonitors.filter((monitor) => (monitor.primary_status ?? '').toLowerCase() !== 'operational').length;
  const operationalCount = Math.max(channelMonitors.length - unhealthyCount, 0);
  const averageLatency = (() => {
    const values = channelMonitors
      .map((monitor) => monitor.primary_latency_ms)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (values.length === 0) return undefined;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  })();
  const overallChannelStatus = channelMonitors.length > 0 && unhealthyCount === 0 ? 'operational' : 'degraded';
  const errorMessage = getErrorMessage(channelMonitorsQuery.error ?? channelHistoryQueries.find((query) => query.error)?.error);
  const isRefreshing = channelMonitorsQuery.isRefetching || channelHistoryQueries.some((query) => query.isRefetching);
  const isRunningAll = runningMonitorIds.length > 1;

  function refetchChannelData() {
    channelMonitorsQuery.refetch();
    channelHistoryQueries.forEach((query) => query.refetch());
  }

  async function handleRunChannelMonitor(monitorId: number) {
    if (runningMonitorIds.includes(monitorId)) return;

    setRunningMonitorIds((ids) => [...ids, monitorId]);
    try {
      await runChannelMonitor(monitorId);
      await Promise.all([
        channelMonitorsQuery.refetch(),
        ...channelHistoryQueries
          .filter((_, index) => channelMonitors[index]?.id === monitorId)
          .map((query) => query.refetch()),
      ]);
    } finally {
      setRunningMonitorIds((ids) => ids.filter((id) => id !== monitorId));
    }
  }

  async function handleRunAll() {
    if (channelMonitors.length === 0 || runningMonitorIds.length > 0) return;

    const ids = channelMonitors.map((monitor) => monitor.id);
    setRunningMonitorIds(ids);
    try {
      await Promise.allSettled(ids.map((id) => runChannelMonitor(id)));
      await Promise.all([channelMonitorsQuery.refetch(), ...channelHistoryQueries.map((query) => query.refetch())]);
    } finally {
      setRunningMonitorIds([]);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 110, gap: 14 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refetchChannelData} tintColor={colors.primary} />}
      >
        <View style={{ borderRadius: 22, backgroundColor: colors.slate, padding: 18, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, backgroundColor: colors.primary }} />
          <View style={{ position: 'absolute', top: 5, left: 0, width: '42%', height: 5, backgroundColor: chartColors.teal }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 28, fontWeight: '900', color: '#fff' }}>渠道状态</Text>
              <Text style={{ marginTop: 7, fontSize: 13, lineHeight: 19, color: '#dbeafe' }}>监控各渠道可用性、对话延迟和最近检测记录。</Text>
            </View>
            <View style={{ borderRadius: 999, backgroundColor: getStatusStyle(overallChannelStatus).bg, paddingHorizontal: 11, paddingVertical: 7 }}>
              <Text style={{ color: getStatusStyle(overallChannelStatus).text, fontSize: 11, fontWeight: '900' }}>{overallChannelStatus === 'operational' ? '正常' : '需关注'}</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <SummaryPill icon={<Signal color={colors.primary} size={16} />} label="总渠道" value={formatNumber(channelMonitors.length)} tone="blue" />
            <SummaryPill icon={<Activity color={colors.success} size={16} />} label="正常" value={formatNumber(operationalCount)} tone="green" />
            <SummaryPill icon={<Gauge color={colors.warning} size={16} />} label="平均延迟" value={`${formatLatencyValue(averageLatency)}ms`} tone="amber" />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {CHANNEL_WINDOW_OPTIONS.map((option) => {
            const active = option.key === channelWindow;
            return (
              <Pressable
                key={option.key}
                onPress={() => setChannelWindow(option.key)}
                style={{ flex: 1, alignItems: 'center', borderRadius: 999, backgroundColor: active ? colors.primary : colors.surface, borderWidth: 1, borderColor: active ? colors.primary : colors.border, paddingVertical: 10 }}
              >
                <Text style={{ color: active ? '#fff' : colors.textSoft, fontSize: 12, fontWeight: '800' }}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            onPress={handleRunAll}
            disabled={channelMonitors.length === 0 || runningMonitorIds.length > 0}
            style={{ flex: 1, borderRadius: 15, backgroundColor: colors.primary, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: channelMonitors.length === 0 || runningMonitorIds.length > 0 ? 0.56 : 1 }}
          >
            <Play color="#fff" size={16} />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>{isRunningAll ? '正在检测全部' : '全部检测'}</Text>
          </Pressable>
          <Pressable
            onPress={refetchChannelData}
            style={{ width: 52, borderRadius: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <RefreshCw color={colors.textSoft} size={18} />
          </Pressable>
        </View>

        {channelWindow !== '7d' ? (
          <View style={{ borderRadius: 14, backgroundColor: colors.warningSoft, padding: 12 }}>
            <Text style={{ color: colors.warning, fontSize: 12, lineHeight: 18 }}>当前管理接口只直接返回 7 天可用率；15/30 天会在后端返回字段后自动显示。</Text>
          </View>
        ) : null}

        {!hasAccount ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>未连接服务器</Text>
            <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 22, color: colors.muted }}>请先前往“服务器”页填写服务地址和 Admin Token，再返回查看渠道状态。</Text>
            <Pressable style={{ marginTop: 14, alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 }} onPress={() => router.push('/settings')}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>去配置服务器</Text>
            </Pressable>
          </View>
        ) : channelMonitorsQuery.isLoading ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>正在加载渠道监控</Text>
            <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 22, color: colors.muted }}>正在拉取后台渠道监控和历史检测记录。</Text>
          </View>
        ) : channelMonitorsQuery.error ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>加载失败</Text>
            <View style={{ marginTop: 12, borderRadius: 14, backgroundColor: colors.dangerSoft, paddingHorizontal: 14, paddingVertical: 12 }}>
              <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{errorMessage}</Text>
            </View>
          </View>
        ) : channelMonitors.length === 0 ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>暂无渠道监控</Text>
            <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 22, color: colors.muted }}>当前还没有配置渠道监控，请先在网页后台添加渠道监控。</Text>
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            {channelMonitors.map((monitor) => (
              <ChannelMonitorCard
                key={monitor.id}
                monitor={monitor}
                history={channelHistoryById[monitor.id] ?? []}
                windowKey={channelWindow}
                running={runningMonitorIds.includes(monitor.id)}
                onRun={() => void handleRunChannelMonitor(monitor.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
