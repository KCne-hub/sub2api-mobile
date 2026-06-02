import { useQuery } from '@tanstack/react-query';
import { Network, Search, ShieldCheck, ShieldOff } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, TextInput, View } from 'react-native';

import { ListCard } from '@/src/components/list-card';
import { ScreenShell } from '@/src/components/screen-shell';
import { useDebouncedValue } from '@/src/hooks/use-debounced-value';
import { formatDisplayTime } from '@/src/lib/formatters';
import { listProxies } from '@/src/services/admin';
import type { AdminProxy } from '@/src/types/admin';

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

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-[16px] bg-[#eef2ff] px-3 py-3">
      <Text className="text-[11px] font-semibold text-[#64748b]">{label}</Text>
      <Text className="mt-1 text-sm font-black text-[#0f172a]">{value}</Text>
    </View>
  );
}

function SummaryTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View className="flex-1 rounded-[18px] px-3 py-3" style={{ backgroundColor: color }}>
      <Text className="text-[11px] font-bold text-white/80">{label}</Text>
      <Text className="mt-1 text-2xl font-black text-white">{value}</Text>
    </View>
  );
}

export default function ProxiesScreen() {
  const [searchText, setSearchText] = useState('');
  const [filter, setFilter] = useState<ProxyFilter>('all');
  const keyword = useDebouncedValue(searchText.trim(), 300);

  const proxiesQuery = useQuery({
    queryKey: ['proxies', keyword],
    queryFn: () => listProxies(keyword),
    staleTime: 60_000,
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
    <View className="pb-2">
      <View className="rounded-[26px] bg-[#111827] p-3">
        <View className="mb-3 flex-row gap-2">
          <SummaryTile label="全部" value={summary.total} color="#4f46e5" />
          <SummaryTile label="正常" value={summary.active} color="#16a34a" />
          <SummaryTile label="关注" value={summary.warning} color="#f97316" />
          <SummaryTile label="异常" value={summary.offline} color="#e11d48" />
        </View>

        <View className="flex-row items-center rounded-[18px] bg-white px-4 py-3">
          <Search color="#6366f1" size={18} />
          <TextInput
            onChangeText={setSearchText}
            placeholder="搜索代理名称 / 主机 / 地区"
            placeholderTextColor="#94a3b8"
            className="ml-3 flex-1 text-base text-[#0f172a]"
          />
        </View>

        <View className="mt-3 flex-row flex-wrap gap-2">
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
                className={active ? 'rounded-full bg-[#22d3ee] px-3 py-2 text-xs font-black text-[#0f172a]' : 'rounded-full bg-[#1e293b] px-3 py-2 text-xs font-bold text-[#cbd5e1]'}
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
      subtitle="查看代理延迟、质量评分、地区和绑定账号数量。"
      titleAside={<Text className="rounded-full bg-[#22d3ee] px-2 py-1 text-[10px] font-black text-[#0f172a]">只读监控</Text>}
      variant="minimal"
      scroll={false}
      bottomInsetClassName="pb-6"
      contentGapClassName="mt-2 gap-2"
    >
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 12, flexGrow: 1 }}
        data={filteredProxies}
        keyExtractor={(item) => `${item.id}`}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={proxiesQuery.isRefetching} onRefresh={() => void proxiesQuery.refetch()} tintColor="#7c3aed" />}
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

          return (
            <ListCard
              title={item.name || `Proxy #${item.id}`}
              meta={`${item.protocol ?? 'proxy'} · ${item.host ?? '--'}${item.port ? `:${item.port}` : ''}`}
              badge={badge.label}
              badgeTone={badge.tone}
              icon={Network}
            >
              <View className="gap-3">
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-row items-center gap-2">
                    {isHealthy ? <ShieldCheck color="#22c55e" size={14} /> : <ShieldOff color="#f43f5e" size={14} />}
                    <Text className="text-sm font-semibold text-[#475569]">状态：{item.status || '--'}</Text>
                  </View>
                  <Text className="text-xs font-semibold text-[#6366f1]">{getLocation(item)}</Text>
                </View>

                <View className="flex-row gap-2">
                  <MetricCell label="延迟" value={formatLatency(item.latency_ms)} />
                  <MetricCell label="质量" value={formatQuality(item)} />
                  <MetricCell label="账号" value={`${item.account_count ?? 0}`} />
                </View>

                {item.quality_summary ? <Text className="text-xs font-medium text-[#64748b]">质量摘要：{item.quality_summary}</Text> : null}
                {item.latency_message ? <Text className="text-xs font-medium text-[#be123c]">延迟信息：{item.latency_message}</Text> : null}
                <Text className="text-xs font-medium text-[#64748b]">最近检测 {formatQualityChecked(item.quality_checked || item.updated_at)}</Text>
              </View>
            </ListCard>
          );
        }}
      />
    </ScreenShell>
  );
}
