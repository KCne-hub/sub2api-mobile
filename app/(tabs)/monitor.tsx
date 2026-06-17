import { useQueries, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Bot, Globe2, RefreshCw, Zap } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BarChartCard } from '@/src/components/bar-chart-card';
import { formatLocalDate, formatTokenValue } from '@/src/lib/formatters';
import { DonutChartCard } from '@/src/components/donut-chart-card';
import { LineTrendChart } from '@/src/components/line-trend-chart';
import { getAdminSettings, getChannelMonitorHistory, getDashboardModels, getDashboardStats, getDashboardTrend, getUsageStats, listAccounts, listChannelMonitors, runChannelMonitor } from '@/src/services/admin';
import { adminConfigState, hasAuthenticatedAdminSession } from '@/src/store/admin-config';
import { chartColors, colors } from '@/src/theme/colors';
import type { ChannelMonitor, ChannelMonitorHistoryItem } from '@/src/types/admin';

const { useSnapshot } = require('valtio/react');

type RangeKey = '24h' | '7d' | '30d' | 'total';
type ChannelWindowKey = '7d' | '15d' | '30d';

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: '24h', label: '24H' },
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: 'total', label: '总' },
];

const RANGE_TITLE_MAP: Record<RangeKey, string> = {
  '24h': '24H',
  '7d': '7D',
  '30d': '30D',
  total: '总数据',
};

const CHANNEL_WINDOW_OPTIONS: Array<{ key: ChannelWindowKey; label: string; days: number }> = [
  { key: '7d', label: '7天', days: 7 },
  { key: '15d', label: '15天', days: 15 },
  { key: '30d', label: '30天', days: 30 },
];

function hasAccountError(account: { status?: string; credentials_status?: string | Record<string, unknown> | null }) {
  const status = `${account.status ?? ''}`.toLowerCase();
  const credentialsStatus = typeof account.credentials_status === 'string' ? account.credentials_status.toLowerCase() : '';
  const errorStatuses = ['error', 'failed', 'invalid'];

  return errorStatuses.includes(status) || errorStatuses.includes(credentialsStatus);
}

function hasAccountRateLimited(account: {
  rate_limit_reset_at?: string | null;
  extra?: Record<string, unknown>;
}) {
  if (account.rate_limit_reset_at) {
    const resetTime = new Date(account.rate_limit_reset_at).getTime();
    if (!Number.isNaN(resetTime) && resetTime > Date.now()) {
      return true;
    }
  }

  const modelLimits = account.extra?.model_rate_limits;
  if (!modelLimits || typeof modelLimits !== 'object' || Array.isArray(modelLimits)) {
    return false;
  }

  const now = Date.now();
  return Object.values(modelLimits as Record<string, unknown>).some((info) => {
    if (!info || typeof info !== 'object' || Array.isArray(info)) return false;

    const resetAt = (info as { rate_limit_reset_at?: unknown }).rate_limit_reset_at;
    if (typeof resetAt !== 'string' || !resetAt.trim()) return false;

    const resetTime = new Date(resetAt).getTime();
    return !Number.isNaN(resetTime) && resetTime > now;
  });
}

function getDateRange(rangeKey: RangeKey) {
  const end = new Date();
  const start = new Date();

  if (rangeKey === 'total') {
    return null;
  }

  if (rangeKey === '24h') {
    start.setHours(end.getHours() - 23, 0, 0, 0);
  } else if (rangeKey === '30d') {
    start.setDate(end.getDate() - 29);
  } else {
    start.setDate(end.getDate() - 6);
  }

  return {
    start_date: formatLocalDate(start),
    end_date: formatLocalDate(end),
    granularity: rangeKey === '24h' ? ('hour' as const) : ('day' as const),
  };
}

function formatNumber(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return new Intl.NumberFormat('en-US').format(value);
}

function formatMoney(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return `$${value.toFixed(2)}`;
}

function formatCompactNumber(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function formatTokenDisplay(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return formatTokenValue(value);
}

function pickNumber(...values: Array<number | null | undefined>) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function formatDuration(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

function formatTime(value?: string | null) {
  if (!value) return '更新时间未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '更新时间未知';
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getPointLabel(value: string, rangeKey: RangeKey) {
  if (rangeKey === '24h') {
    return value.slice(11, 13);
  }

  return value.slice(5, 10);
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

  return '当前无法加载概览数据，请检查服务地址、Token 和网络。';
}

function Section({ title, subtitle, children, right }: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{title}</Text>
          {subtitle ? <Text style={{ marginTop: 6, fontSize: 12, color: colors.muted }}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      <View style={{ marginTop: 14 }}>{children}</View>
    </View>
  );
}

function StatCard({ title, value, detail }: { title: string; value: string; detail?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.border }}>
      <Text style={{ fontSize: 12, color: colors.muted }}>{title}</Text>
      <Text style={{ marginTop: 8, fontSize: 24, fontWeight: '700', color: colors.text }}>{value}</Text>
      {detail ? <Text style={{ marginTop: 6, fontSize: 12, color: colors.muted }}>{detail}</Text> : null}
    </View>
  );
}

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

function formatLatencyValue(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return String(Math.round(value));
}

function formatAvailabilityValue(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return `${value.toFixed(2)}%`;
}

function getAvailabilityValue(monitor: ChannelMonitor, windowKey: ChannelWindowKey) {
  if (windowKey === '7d') return monitor.availability_7d ?? null;
  if (windowKey === '15d') return monitor.availability_15d ?? null;
  return monitor.availability_30d ?? null;
}

function getLatestHistory(monitor: ChannelMonitor, history: ChannelMonitorHistoryItem[]) {
  return history.find((item) => item.model === monitor.primary_model) ?? history[0];
}

function MetricBox({
  icon,
  label,
  value,
  unit,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <View style={{ flex: 1, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: colors.border, padding: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon}
        <Text style={{ fontSize: 10, fontWeight: '800', color: colors.faint }}>{label}</Text>
      </View>
      <Text style={{ marginTop: 8, fontSize: 19, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] }}>
        {value}
        <Text style={{ fontSize: 10, color: colors.muted }}> {unit}</Text>
      </Text>
    </View>
  );
}

function ChannelTimeline({ history }: { history: ChannelMonitorHistoryItem[] }) {
  const visibleHistory = history.slice(0, 60).reverse();
  const placeholders = Array.from({ length: Math.max(0, 60 - visibleHistory.length) });
  const bars = [
    ...placeholders.map((_, index) => ({ key: `empty-${index}`, status: 'empty', title: '' })),
    ...visibleHistory.map((item) => ({
      key: String(item.id),
      status: item.status,
      title: `${formatTime(item.checked_at)} · ${getStatusLabel(item.status)} · ${formatLatencyValue(item.latency_ms)}ms`,
    })),
  ];

  return (
    <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ fontSize: 10, fontWeight: '800', color: colors.faint }}>近 60 次记录</Text>
        <Text style={{ fontSize: 10, fontWeight: '800', color: colors.faint }}>NOW</Text>
      </View>
      <View style={{ height: 24, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
        {bars.map((bar) => {
          const style = getStatusStyle(bar.status);
          return (
            <View
              key={bar.key}
              style={{
                flex: 1,
                minWidth: 3,
                height: Math.max(6, Math.round(24 * style.height)),
                borderRadius: 3,
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
    <View style={{ borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 16, boxShadow: '0 14px 28px rgba(15, 23, 42, 0.08)' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flexDirection: 'row', flex: 1, gap: 11 }}>
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
              <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 11, color: colors.muted }}>
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
            style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center', opacity: running ? 0.55 : 1 }}
          >
            <RefreshCw color={colors.textSoft} size={17} />
          </Pressable>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <MetricBox icon={<Zap color={colors.faint} size={13} />} label="对话延迟" value={formatLatencyValue(latency)} unit="ms" />
        <MetricBox icon={<Globe2 color={colors.faint} size={13} />} label="端点 PING" value={formatLatencyValue(pingLatency)} unit="ms" />
      </View>

      <View style={{ marginTop: 16, paddingTop: 13, borderTopWidth: 1, borderTopColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
          <View>
            <Text style={{ fontSize: 11, color: colors.muted }}>可用性 · {CHANNEL_WINDOW_OPTIONS.find((item) => item.key === windowKey)?.label}</Text>
            <Text style={{ marginTop: 6, fontSize: 11, color: colors.faint }}>最近更新 {formatTime(latest?.checked_at ?? monitor.last_checked_at)}</Text>
          </View>
          <Text style={{ fontSize: 31, lineHeight: 34, fontWeight: '900', color: typeof availability === 'number' ? statusStyle.text : colors.faint, fontVariant: ['tabular-nums'] }}>
            {formatAvailabilityValue(availability)}
          </Text>
        </View>
      </View>

      <ChannelTimeline history={history} />
    </View>
  );
}

export default function MonitorScreen() {
  const config = useSnapshot(adminConfigState);
  const hasAccount = hasAuthenticatedAdminSession(config);
  const [rangeKey, setRangeKey] = useState<RangeKey>('7d');
  const [channelWindow, setChannelWindow] = useState<ChannelWindowKey>('7d');
  const [runningMonitorId, setRunningMonitorId] = useState<number | null>(null);
  const range = useMemo(() => getDateRange(rangeKey), [rangeKey]);
  const hasRange = Boolean(range);

  const statsQuery = useQuery({
    queryKey: ['monitor-stats'],
    queryFn: getDashboardStats,
    enabled: hasAccount,
    staleTime: 60_000,
  });
  const settingsQuery = useQuery({
    queryKey: ['admin-settings'],
    queryFn: getAdminSettings,
    enabled: hasAccount,
    staleTime: 120_000,
  });
  const accountsQuery = useQuery({
    queryKey: ['monitor-accounts'],
    queryFn: () => listAccounts(''),
    enabled: hasAccount,
    staleTime: 60_000,
  });
  const channelMonitorsQuery = useQuery({
    queryKey: ['channel-monitors'],
    queryFn: listChannelMonitors,
    enabled: hasAccount,
    staleTime: 60_000,
  });
  const rangeUsageQuery = useQuery({
    queryKey: ['monitor-usage-stats', rangeKey, range?.start_date, range?.end_date],
    queryFn: () => {
      if (!range) {
        throw new Error('RANGE_REQUIRED');
      }

      return getUsageStats(range);
    },
    enabled: hasAccount && hasRange,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  });
  const trendQuery = useQuery({
    queryKey: ['monitor-trend', rangeKey, range?.start_date, range?.end_date, range?.granularity],
    queryFn: () => {
      if (!range) {
        throw new Error('RANGE_REQUIRED');
      }

      return getDashboardTrend(range);
    },
    enabled: hasAccount && hasRange,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  });
  const modelsQuery = useQuery({
    queryKey: ['monitor-models', rangeKey, range?.start_date, range?.end_date],
    queryFn: () => {
      if (!range) {
        throw new Error('RANGE_REQUIRED');
      }

      return getDashboardModels(range);
    },
    enabled: hasAccount && hasRange,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
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

  function refetchAll() {
    statsQuery.refetch();
    settingsQuery.refetch();
    accountsQuery.refetch();
    channelMonitorsQuery.refetch();
    channelHistoryQueries.forEach((query) => query.refetch());
    if (hasRange) {
      rangeUsageQuery.refetch();
      trendQuery.refetch();
      modelsQuery.refetch();
    }
  }

  async function handleRunChannelMonitor(monitorId: number) {
    if (runningMonitorId !== null) return;

    setRunningMonitorId(monitorId);
    try {
      await runChannelMonitor(monitorId);
      await Promise.all([
        channelMonitorsQuery.refetch(),
        ...channelHistoryQueries
          .filter((query, index) => channelMonitors[index]?.id === monitorId)
          .map((query) => query.refetch()),
      ]);
    } finally {
      setRunningMonitorId(null);
    }
  }

  const stats = statsQuery.data;
  const siteName = settingsQuery.data?.site_name?.trim() || '管理控制台';
  const accounts = accountsQuery.data?.items ?? [];
  const trend = trendQuery.data?.trend ?? [];
  const topModels = (modelsQuery.data?.models ?? []).slice(0, 5);
  const errorMessage = getErrorMessage(statsQuery.error ?? settingsQuery.error ?? accountsQuery.error ?? channelMonitorsQuery.error ?? rangeUsageQuery.error ?? trendQuery.error ?? modelsQuery.error);
  const currentPageErrorAccounts = accounts.filter(hasAccountError).length;
  const currentPageLimitedAccounts = accounts.filter((item) => hasAccountRateLimited(item)).length;
  const currentPageBusyAccounts = accounts.filter((item) => {
    if (hasAccountError(item) || hasAccountRateLimited(item)) return false;
    return (item.current_concurrency ?? 0) > 0;
  }).length;
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
  const overallChannelStatus = channelMonitors.some((monitor) => (monitor.primary_status ?? '').toLowerCase() !== 'operational') ? 'degraded' : 'operational';
  const totalAccounts = stats?.total_accounts ?? accountsQuery.data?.total ?? accounts.length;
  const aggregatedErrorAccounts = stats?.error_accounts ?? 0;
  const errorAccounts = Math.max(aggregatedErrorAccounts, currentPageErrorAccounts);
  const healthyAccounts = stats?.normal_accounts ?? Math.max(totalAccounts - errorAccounts, 0);
  const overloadAccounts = stats?.overload_accounts ?? 0;
  const rateLimitAccounts = stats?.ratelimit_accounts ?? currentPageLimitedAccounts;
  const averageDuration = stats?.average_duration_ms ?? stats?.avg_duration_ms;
  const latestTrendPoints = trend.slice(-6).reverse();
  const selectedTokenTotal = pickNumber(
    rangeKey === 'total' ? stats?.total_tokens : rangeUsageQuery.data?.total_tokens,
    trend.reduce((sum, item) => sum + item.total_tokens, 0),
    rangeKey === '24h' ? stats?.today_tokens : undefined
  );
  const selectedCostTotal = pickNumber(
    rangeKey === 'total' ? stats?.total_actual_cost ?? stats?.total_cost : rangeUsageQuery.data?.total_account_cost ?? rangeUsageQuery.data?.total_actual_cost ?? rangeUsageQuery.data?.total_cost,
    trend.reduce((sum, item) => sum + (item.actual_cost ?? item.cost ?? 0), 0),
    rangeKey === '24h' ? stats?.today_actual_cost ?? stats?.today_cost : undefined
  );
  const selectedOutputTotal = pickNumber(
    rangeKey === 'total' ? stats?.total_output_tokens : rangeUsageQuery.data?.total_output_tokens,
    trend.reduce((sum, item) => sum + item.output_tokens, 0),
    rangeKey === '24h' ? stats?.today_output_tokens : undefined
  );
  const selectedInputTotal = pickNumber(
    rangeKey === 'total' ? stats?.total_input_tokens : rangeUsageQuery.data?.total_input_tokens,
    trend.reduce((sum, item) => sum + item.input_tokens, 0),
    rangeKey === '24h' ? stats?.today_input_tokens : undefined
  );
  const selectedRequestTotal = pickNumber(
    rangeKey === 'total' ? stats?.total_requests : rangeUsageQuery.data?.total_requests,
    trend.reduce((sum, item) => sum + item.requests, 0),
    rangeKey === '24h' ? stats?.today_requests : undefined
  );
  const rangeTitle = RANGE_TITLE_MAP[rangeKey];
  const isLoading = statsQuery.isLoading || settingsQuery.isLoading || accountsQuery.isLoading;
  const hasError = Boolean(statsQuery.error || settingsQuery.error || accountsQuery.error || channelMonitorsQuery.error || rangeUsageQuery.error || trendQuery.error || modelsQuery.error);

  const throughputPoints = useMemo(
    () => trend.map((item) => ({ label: getPointLabel(item.date, rangeKey), value: item.total_tokens })),
    [rangeKey, trend]
  );
  const requestPoints = useMemo(
    () => trend.map((item) => ({ label: getPointLabel(item.date, rangeKey), value: item.requests })),
    [rangeKey, trend]
  );
  const costPoints = useMemo(
    () => trend.map((item) => ({ label: getPointLabel(item.date, rangeKey), value: item.actual_cost ?? item.cost })),
    [rangeKey, trend]
  );
  const totalInputTokens = pickNumber(selectedInputTotal, 0) ?? 0;
  const totalOutputTokens = pickNumber(selectedOutputTotal, 0) ?? 0;
  const totalCacheReadTokens = rangeKey === 'total'
    ? pickNumber(stats?.total_cache_read_tokens, 0) ?? 0
    : trend.reduce((sum, item) => sum + item.cache_read_tokens, 0);
  const isRefreshing = statsQuery.isRefetching || settingsQuery.isRefetching || accountsQuery.isRefetching || channelMonitorsQuery.isRefetching || channelHistoryQueries.some((query) => query.isRefetching) || rangeUsageQuery.isRefetching || trendQuery.isRefetching || modelsQuery.isRefetching;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refetchAll()} tintColor={colors.primary} />}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>概览</Text>
            <Text style={{ marginTop: 6, fontSize: 13, color: colors.muted }}>{siteName} 的当前运行状态。</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {RANGE_OPTIONS.map((option) => {
                const active = option.key === rangeKey;
                return (
                  <Pressable
                    key={option.key}
                    style={{ backgroundColor: active ? colors.primary : colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
                    onPress={() => setRangeKey(option.key)}
                  >
                    <Text style={{ color: active ? '#fff' : colors.textSoft, fontSize: 12, fontWeight: '700' }}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ marginTop: 8, fontSize: 12, color: colors.muted }}>{range ? `${range.start_date} 到 ${range.end_date}` : '全部历史数据'}</Text>
          </View>
        </View>

        {!hasAccount ? (
          <Section title="未连接服务器" subtitle="需要先配置连接">
            <Text style={{ fontSize: 14, lineHeight: 22, color: colors.muted }}>请先前往“服务器”页填写服务地址和 Admin Token，再返回查看概览数据。</Text>
            <Pressable style={{ marginTop: 14, alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 }} onPress={() => router.push('/settings')}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>去配置服务器</Text>
            </Pressable>
          </Section>
        ) : isLoading ? (
          <Section title="正在加载概览" subtitle="请稍候">
            <Text style={{ fontSize: 14, lineHeight: 22, color: colors.muted }}>已连接服务器，正在拉取概览、模型和账号状态数据。</Text>
          </Section>
        ) : hasError ? (
          <Section title="加载失败" subtitle="请检查连接配置">
            <View style={{ borderRadius: 14, backgroundColor: colors.dangerSoft, paddingHorizontal: 14, paddingVertical: 12 }}>
              <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{errorMessage}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
              <Pressable style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 12, alignItems: 'center' }} onPress={refetchAll}>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>重试</Text>
              </Pressable>
              <Pressable style={{ flex: 1, backgroundColor: colors.surfaceSoft, borderRadius: 14, paddingVertical: 12, alignItems: 'center' }} onPress={() => router.push('/settings')}>
                <Text style={{ color: colors.textSoft, fontSize: 13, fontWeight: '700' }}>检查服务器</Text>
              </Pressable>
            </View>
          </Section>
        ) : (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <StatCard
                title={`${rangeTitle} Token`}
                value={formatTokenDisplay(selectedTokenTotal)}
                detail={`请求 ${formatNumber(selectedRequestTotal)} · 输出 ${formatTokenDisplay(selectedOutputTotal)}`}
              />
              <StatCard
                title={`${rangeTitle} 成本`}
                value={formatMoney(selectedCostTotal)}
                detail={rangeKey === 'total' ? `累计请求 ${formatNumber(stats?.total_requests)}` : `TPM ${formatNumber(stats?.tpm)}`}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <StatCard
                title="平均延迟"
                value={formatDuration(averageDuration)}
                detail={`RPM ${formatNumber(stats?.rpm)}`}
              />
              <StatCard
                title="统计状态"
                value={stats?.stats_stale ? '待刷新' : '最新'}
                detail={formatTime(stats?.stats_updated_at)}
              />
            </View>
            <Section
              title="账号概览"
              subtitle="总数、健康、异常和限流状态一览"
              right={(
                <Pressable
                  style={{ alignSelf: 'flex-start', backgroundColor: colors.surfaceSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}
                  onPress={() => router.push('/accounts/overview')}
                >
                  <Text style={{ color: colors.textSoft, fontSize: 12, fontWeight: '700' }}>账号清单</Text>
                </Pressable>
              )}
            >
              <Pressable onPress={() => router.push('/accounts/overview')}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1, backgroundColor: colors.surfaceSoft, borderRadius: 14, padding: 12 }}>
                    <Text style={{ fontSize: 11, color: colors.muted }}>总数</Text>
                    <Text style={{ marginTop: 6, fontSize: 18, fontWeight: '700', color: colors.text }}>{formatNumber(totalAccounts)}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: colors.successSoft, borderRadius: 14, padding: 12 }}>
                    <Text style={{ fontSize: 11, color: colors.success }}>健康</Text>
                    <Text style={{ marginTop: 6, fontSize: 18, fontWeight: '700', color: colors.text }}>{formatNumber(healthyAccounts)}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: colors.dangerSoft, borderRadius: 14, padding: 12 }}>
                    <Text style={{ fontSize: 11, color: colors.danger }}>异常</Text>
                    <Text style={{ marginTop: 6, fontSize: 18, fontWeight: '700', color: colors.danger }}>{formatNumber(errorAccounts)}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: colors.warningSoft, borderRadius: 14, padding: 12 }}>
                    <Text style={{ fontSize: 11, color: colors.warning }}>限流</Text>
                    <Text style={{ marginTop: 6, fontSize: 18, fontWeight: '700', color: colors.warning }}>{formatNumber(rateLimitAccounts)}</Text>
                  </View>
                </View>
                <Text style={{ marginTop: 10, fontSize: 12, color: colors.muted }}>过载 {formatNumber(overloadAccounts)} · 繁忙 {formatNumber(currentPageBusyAccounts)} · 点击进入账号清单。</Text>
              </Pressable>
            </Section>

            <Section
              title="渠道状态"
              subtitle="与网页 /monitor 对齐的渠道可用性、延迟和最近记录"
              right={(
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ borderRadius: 999, backgroundColor: getStatusStyle(overallChannelStatus).bg, paddingHorizontal: 10, paddingVertical: 7 }}>
                    <Text style={{ color: getStatusStyle(overallChannelStatus).text, fontSize: 11, fontWeight: '900' }}>{overallChannelStatus === 'operational' ? 'OPERATIONAL' : 'DEGRADED'}</Text>
                  </View>
                  <Pressable
                    style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft, borderRadius: 12 }}
                    onPress={() => {
                      channelMonitorsQuery.refetch();
                      channelHistoryQueries.forEach((query) => query.refetch());
                    }}
                  >
                    <RefreshCw color={colors.textSoft} size={17} />
                  </Pressable>
                </View>
              )}
            >
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                {CHANNEL_WINDOW_OPTIONS.map((option) => {
                  const active = option.key === channelWindow;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => setChannelWindow(option.key)}
                      style={{ flex: 1, alignItems: 'center', borderRadius: 999, backgroundColor: active ? colors.primary : colors.surfaceSoft, paddingVertical: 9 }}
                    >
                      <Text style={{ color: active ? '#fff' : colors.textSoft, fontSize: 12, fontWeight: '800' }}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {channelMonitorsQuery.isLoading ? (
                <Text style={{ fontSize: 14, color: colors.muted }}>正在加载渠道监控数据...</Text>
              ) : channelMonitors.length === 0 ? (
                <Text style={{ fontSize: 14, color: colors.muted }}>当前还没有配置渠道监控，请先在网页后台添加渠道监控。</Text>
              ) : (
                <View style={{ gap: 14 }}>
                  {channelWindow !== '7d' ? (
                    <View style={{ borderRadius: 14, backgroundColor: colors.warningSoft, padding: 12 }}>
                      <Text style={{ color: colors.warning, fontSize: 12, lineHeight: 18 }}>当前管理接口只直接返回 7 天可用率；15/30 天会在后端返回字段后自动显示。</Text>
                    </View>
                  ) : null}

                  {channelMonitors.map((monitor) => (
                    <ChannelMonitorCard
                      key={monitor.id}
                      monitor={monitor}
                      history={channelHistoryById[monitor.id] ?? []}
                      windowKey={channelWindow}
                      running={runningMonitorId === monitor.id}
                      onRun={() => void handleRunChannelMonitor(monitor.id)}
                    />
                  ))}
                </View>
              )}
            </Section>

            {rangeKey !== 'total' && throughputPoints.length > 1 ? (
              <LineTrendChart title="Token 吞吐" subtitle="当前时间范围内的 Token 变化趋势" points={throughputPoints} color={chartColors.blue} formatValue={formatTokenDisplay} />
            ) : null}

            {rangeKey !== 'total' && requestPoints.length > 1 ? (
              <LineTrendChart title="请求趋势" subtitle="当前时间范围内的请求变化趋势" points={requestPoints} color={chartColors.teal} formatValue={formatCompactNumber} />
            ) : null}

            {rangeKey !== 'total' && costPoints.length > 1 ? (
              <LineTrendChart title="成本趋势" subtitle="当前时间范围内的成本变化趋势" points={costPoints} color={chartColors.violet} formatValue={formatMoney} />
            ) : null}

            <BarChartCard
              title="Token 结构"
              subtitle="输入、输出、缓存读取占比"
              items={[
                { label: '输入 Token', value: totalInputTokens, color: chartColors.blue, hint: '请求进入模型前消耗的 token。' },
                { label: '输出 Token', value: totalOutputTokens, color: chartColors.teal, hint: '模型返回内容消耗的 token。' },
                { label: '缓存读取 Token', value: totalCacheReadTokens, color: chartColors.amber, hint: '命中缓存后复用的 token。' },
              ]}
              formatValue={formatTokenDisplay}
            />

            <DonutChartCard
              title="账号健康"
              subtitle="健康、繁忙、限流、异常分布"
              centerLabel="总账号"
              centerValue={formatNumber(totalAccounts)}
              segments={[
                { label: '健康', value: healthyAccounts, color: chartColors.teal },
                { label: '繁忙', value: currentPageBusyAccounts, color: chartColors.amber },
                { label: '限流', value: rateLimitAccounts, color: chartColors.gray },
                { label: '异常', value: errorAccounts, color: chartColors.rose },
              ]}
            />

            {rangeKey !== 'total' ? (
              <BarChartCard
                title="热点模型"
                subtitle="当前时间范围内最活跃的模型"
                items={topModels.map((model) => ({
                  label: model.model,
                  value: model.total_tokens,
                  color: chartColors.blue,
                  meta: `请求 ${formatNumber(model.requests)} · 成本 ${formatMoney(model.actual_cost ?? model.cost)}`,
                }))}
                formatValue={formatCompactNumber}
              />
            ) : null}

            {rangeKey !== 'total' ? (
              <Section title="趋势摘要" subtitle="最近几个统计点的请求、Token 和成本变化">
                {latestTrendPoints.length === 0 ? (
                  <Text style={{ fontSize: 14, color: colors.muted }}>当前时间范围没有趋势数据。</Text>
                ) : (
                  <View style={{ gap: 12 }}>
                    <View style={{ gap: 10 }}>
                      {latestTrendPoints.map((point) => (
                        <View key={point.date} style={{ backgroundColor: colors.surfaceSoft, borderRadius: 14, padding: 12 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{point.date}</Text>
                          <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 11, color: colors.muted }}>请求</Text>
                              <Text style={{ marginTop: 4, fontSize: 15, fontWeight: '700', color: colors.text }}>{formatCompactNumber(point.requests)}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 11, color: colors.muted }}>Token</Text>
                              <Text style={{ marginTop: 4, fontSize: 15, fontWeight: '700', color: colors.text }}>{formatTokenDisplay(point.total_tokens)}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 11, color: colors.muted }}>成本</Text>
                              <Text style={{ marginTop: 4, fontSize: 15, fontWeight: '700', color: colors.text }}>{formatMoney(point.actual_cost ?? point.cost)}</Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </Section>
            ) : null}

          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
