import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { Network, Radar, Search, ShieldCheck, ShieldOff } from 'lucide-react-native';
import { useMemo, useState } from 'react';

import { ListCard } from '@/src/components/list-card';
import { ScreenShell } from '@/src/components/screen-shell';
import { useDebouncedValue } from '@/src/hooks/use-debounced-value';
import { formatDisplayTime } from '@/src/lib/formatters';
import { checkProxyQuality, listProxies } from '@/src/services/admin';
import { colors } from '@/src/theme/colors';
import type { AdminProxy, ProxyQualityCheckResult } from '@/src/types/admin';

type ProxyFilter = 'all' | 'active' | 'warning' | 'offline';

function getProxyBadge(proxy: AdminProxy): { label: string; tone: 'success' | 'muted' | 'danger' | 'default' } {
  const status = `${proxy.status ?? ''}`.toLowerCase();
  const qualityStatus = `${proxy.quality_status ?? ''}`.toLowerCase();
  const latencyStatus = `${proxy.latency_status ?? ''}`.toLowerCase();

  if (status === 'active' && latencyStatus === 'success' && !['warn', 'poor', 'failed'].includes(qualityStatus)) {
    return { label: '正常', tone: 'success' };
  }

  if (status === 'active' && (qualityStatus === 'warn' || latencyStatus === 'success')) {
    return { label: '需关注', tone: 'default' };
  }

  if (status === 'disabled' || status === 'inactive') {
    return { label: '停用', tone: 'muted' };
  }

  return { label: '异常', tone: 'danger' };
}

function getFilterKey(proxy: AdminProxy): ProxyFilter {
  const badge = getProxyBadge(proxy);
  if (badge.tone === 'success') return 'active';
  if (badge.tone === 'danger') return 'offline';
  if (badge.tone === 'default') return 'warning';
  return 'offline';
}

function formatLatency(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--';
  }

  return `${Math.round(value)}ms`;
}

function formatQuality(proxy: AdminProxy) {
  const grade = proxy.quality_grade?.trim();
  const score = typeof proxy.quality_score === 'number' && Number.isFinite(proxy.quality_score) ? `${Math.round(proxy.quality_score)}` : '';

  if (grade && score) return `${grade} / ${score}`;
  if (grade) return grade;
  if (score) return score;
  return '--';
}

function formatQualityChecked(value?: number | string | null) {
  if (!value) return '--';

  if (typeof value === 'number') {
    const timestamp = value > 10_000_000_000 ? value : value * 1000;
    return formatDisplayTime(new Date(timestamp).toISOString());
  }

  return formatDisplayTime(value);
}

function getLocation(proxy: AdminProxy) {
  const parts = [proxy.country_code, proxy.country, proxy.region, proxy.city].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : '--';
}

function formatProxyCheckFeedback(result?: ProxyQualityCheckResult) {
  const parts: string[] = [];

  if (typeof result?.grade === 'string' && result.grade.trim()) {
    parts.push(`等级 ${result.grade.trim()}`);
  }

  if (typeof result?.score === 'number' && Number.isFinite(result.score)) {
    parts.push(`评分 ${Math.round(result.score)}`);
  }

  if (typeof result?.base_latency_ms === 'number' && Number.isFinite(result.base_latency_ms)) {
    parts.push(`延迟 ${Math.round(result.base_latency_ms)}ms`);
  }

  if (typeof result?.summary === 'string' && result.summary.trim()) {
    parts.push(result.summary.trim());
  }

  return parts.length > 0 ? parts.join(' · ') : '检测完成';
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-[12px] bg-[#eef4f8] px-3 py-3">
      <Text className="text-[11px] font-semibold text-[#64748b]">{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit className="mt-1 text-sm font-bold text-[#172033]">{value}</Text>
    </View>
  );
}

function SummaryTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View className="flex-1 rounded-[14px] px-3 py-2.5" style={{ backgroundColor: color }}>
      <Text className="text-[11px] font-bold text-white/80">{label}</Text>
      <Text className="mt-0.5 text-xl font-black text-white">{value}</Text>
    </View>
  );
}

export default function ProxiesScreen() {
  const [searchText, setSearchText] = useState('');
  const [filter, setFilter] = useState<ProxyFilter>('all');
  const [checkingProxyId, setCheckingProxyId] = useState<number | null>(null);
  const [feedbackByProxyId, setFeedbackByProxyId] = useState<Record<number, string>>({});
  const keyword = useDebouncedValue(searchText.trim(), 300);
  const queryClient = useQueryClient();

  const proxiesQuery = useQuery({
    queryKey: ['proxies', keyword],
    queryFn: () => listProxies(keyword),
    staleTime: 60_000,
  });

  const checkMutation = useMutation({
    mutationFn: (proxyId: number) => checkProxyQuality(proxyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proxies'] });
    },
  });

  const proxies = proxiesQuery.data?.items ?? [];
  const summary = useMemo(() => {
    const active = proxies.filter((proxy) => getFilterKey(proxy) === 'active').length;
    const warning = proxies.filter((proxy) => getFilterKey(proxy) === 'warning').length;
    const offline = proxies.filter((proxy) => getFilterKey(proxy) === 'offline').length;
    return { total: proxies.length, active, warning, offline };
  }, [proxies]);

  const filteredProxies = useMemo(() => {
    const matched = proxies.filter((proxy) => {
      if (filter === 'all') return true;
      return getFilterKey(proxy) === filter;
    });

    return [...matched].sort((left, right) => {
      const leftScore = typeof left.quality_score === 'number' ? left.quality_score : -1;
      const rightScore = typeof right.quality_score === 'number' ? right.quality_score : -1;
      if (leftScore !== rightScore) return rightScore - leftScore;
      return (left.latency_ms ?? Number.MAX_SAFE_INTEGER) - (right.latency_ms ?? Number.MAX_SAFE_INTEGER);
    });
  }, [filter, proxies]);

  const errorMessage = proxiesQuery.error instanceof Error ? proxiesQuery.error.message : '';

  const listHeader = (
    <View className="pb-3">
      <View className="rounded-[18px] border border-[#d8e0ea] bg-white p-3">
        <View className="mb-2.5 flex-row gap-2">
          <SummaryTile label="全部" value={summary.total} color={colors.primary} />
          <SummaryTile label="正常" value={summary.active} color={colors.success} />
          <SummaryTile label="关注" value={summary.warning} color={colors.warning} />
          <SummaryTile label="异常" value={summary.offline} color={colors.danger} />
        </View>

        <View className="flex-row items-center rounded-[12px] bg-[#eef4f8] px-4 py-2.5">
          <Search color={colors.primary} size={18} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="搜索代理名称 / 主机 / 地区"
            placeholderTextColor={colors.faint}
            className="ml-3 flex-1 text-sm text-[#172033]"
          />
        </View>

        <View className="mt-2.5 flex-row gap-2">
          {([
            ['all', `全部 ${summary.total}`],
            ['active', `正常 ${summary.active}`],
            ['warning', `关注 ${summary.warning}`],
            ['offline', `异常 ${summary.offline}`],
          ] as const).map(([key, label]) => {
            const active = filter === key;
            return (
              <Text
                key={key}
                onPress={() => setFilter(key)}
                numberOfLines={1}
                adjustsFontSizeToFit
                className={active ? 'flex-1 rounded-full bg-[#2563eb] px-2.5 py-2 text-center text-xs font-bold text-white' : 'flex-1 rounded-full bg-[#eef4f8] px-2.5 py-2 text-center text-xs font-semibold text-[#35445c]'}
              >
                {label}
              </Text>
            );
          })}
        </View>
      </View>
    </View>
  );

  return (
    <ScreenShell
      title="代理池"
      subtitle="查看代理延迟、质量评分、地区和绑定账号数量，并支持手动检测。"
      titleAside={<Text className="rounded-full bg-[#dbeafe] px-2 py-1 text-[10px] font-bold text-[#1d4ed8]">可手动检测</Text>}
      variant="minimal"
      scroll={false}
      bottomInsetClassName="pb-5"
      contentGapClassName="mt-2 gap-2"
    >
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 16, flexGrow: 1 }}
        data={filteredProxies}
        keyExtractor={(item) => `${item.id}`}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={proxiesQuery.isRefetching} onRefresh={() => void proxiesQuery.refetch()} tintColor={colors.primary} />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <ListCard title="暂无代理" meta={errorMessage || '连上后这里会展示代理池状态。'} icon={Network} />
        }
        ItemSeparatorComponent={() => <View className="h-4" />}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        renderItem={({ item }) => {
          const badge = getProxyBadge(item);
          const isHealthy = badge.tone === 'success';
          const isCheckingCurrent = checkingProxyId === item.id && checkMutation.isPending;
          const feedback = feedbackByProxyId[item.id];

          return (
            <ListCard
              title={item.name || `Proxy #${item.id}`}
              meta={`${item.protocol ?? 'proxy'} · ${item.host ?? '--'}${item.port ? `:${item.port}` : ''}`}
              badge={badge.label}
              badgeTone={badge.tone}
              icon={Network}
            >
              <View className="gap-3">
                <View className="gap-2">
                  <View className="flex-row items-center gap-2">
                    {isHealthy ? <ShieldCheck color={colors.success} size={14} /> : <ShieldOff color={colors.danger} size={14} />}
                    <Text numberOfLines={1} className="text-sm font-semibold text-[#475569]">状态：{item.status || '--'}</Text>
                  </View>
                  <Text numberOfLines={2} className="text-xs font-semibold leading-4 text-[#2563eb]">{getLocation(item)}</Text>
                </View>

                <View className="flex-row gap-2">
                  <MetricCell label="延迟" value={formatLatency(item.latency_ms)} />
                  <MetricCell label="质量" value={formatQuality(item)} />
                  <MetricCell label="账号" value={`${item.account_count ?? 0}`} />
                </View>

                {item.quality_summary ? <Text className="text-xs font-medium leading-5 text-[#64748b]">质量摘要：{item.quality_summary}</Text> : null}
                {item.latency_message ? <Text className="text-xs font-medium leading-5 text-[#be123c]">延迟信息：{item.latency_message}</Text> : null}
                <View className="flex-row items-end justify-between gap-3">
                  <Text className="flex-1 text-xs font-medium leading-5 text-[#64748b]">最近检测 {formatQualityChecked(item.quality_checked || item.updated_at)}</Text>
                  <Pressable
                    disabled={isCheckingCurrent}
                    onPress={(event) => {
                      event.stopPropagation();
                      setCheckingProxyId(item.id);
                      checkMutation.mutate(item.id, {
                        onSuccess: (result) => {
                          setFeedbackByProxyId((current) => ({ ...current, [item.id]: formatProxyCheckFeedback(result) }));
                        },
                        onError: (error) => {
                          const message = error instanceof Error && error.message ? error.message : '检测失败';
                          setFeedbackByProxyId((current) => ({ ...current, [item.id]: message }));
                        },
                        onSettled: () => {
                          setCheckingProxyId((current) => (current === item.id ? null : current));
                        },
                      });
                    }}
                    className={isCheckingCurrent ? 'min-w-[92px] flex-row items-center justify-center gap-2 rounded-full bg-[#dbeafe] px-4 py-2 opacity-80' : 'min-w-[92px] flex-row items-center justify-center gap-2 rounded-full bg-[#243044] px-4 py-2'}
                  >
                    {isCheckingCurrent ? <ActivityIndicator color={colors.primary} size="small" /> : <Radar color="#ffffff" size={14} />}
                    <Text className={isCheckingCurrent ? 'text-xs font-bold text-[#1d4ed8]' : 'text-xs font-bold text-white'}>
                      {isCheckingCurrent ? '检测中...' : '检测'}
                    </Text>
                  </Pressable>
                </View>
                {feedback ? <Text className="text-xs font-semibold text-[#0f766e]">检测结果：{feedback}</Text> : null}
              </View>
            </ListCard>
          );
        }}
      />
    </ScreenShell>
  );
}
