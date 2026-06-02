import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Search, ShieldCheck, ShieldOff } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import type { DimensionValue } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';

import { ListCard } from '@/src/components/list-card';
import { ScreenShell } from '@/src/components/screen-shell';
import { useDebouncedValue } from '@/src/hooks/use-debounced-value';
import { formatCompactNumber, formatTokenValue } from '@/src/lib/formatters';
import {
  clearAccountError,
  getAccountUsage,
  getBatchAccountTodayStats,
  listAccounts,
  refreshAccount,
  setAccountSchedulable,
  testAccountConnection,
} from '@/src/services/admin';
import { colors } from '@/src/theme/colors';
import type { AccountTodayStats, AccountTodayStatsBatch, AccountUsage, AccountUsageWindow, AdminAccount } from '@/src/types/admin';

type AccountStatusFilter = 'all' | 'active' | 'paused' | 'error';
type GroupFilter = 'all' | 'ungrouped' | `group:${number}`;
type UsageSort = 'usage-desc' | 'usage-asc';
type AccountVisualStatus = {
  filterKey: AccountStatusFilter;
  label: '正常' | '暂停' | '异常';
  badgeTone: 'success' | 'muted' | 'danger';
};
type AccountUsageSummary = {
  requests: number;
  tokens: number;
  accountCost: number;
  userCost?: number;
  utilization?: number;
  resetsAt?: string | null;
  isLoading: boolean;
  hasError: boolean;
};
type TestFeedback = {
  message: string;
  tone: 'success' | 'danger' | 'muted';
};

const OAUTH_USAGE_STALE_TIME = 60_000;

function formatTime(value?: string | null) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

function formatResetTime(value?: string | null) {
  if (!value) return '';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';

  const diff = timestamp - Date.now();
  if (diff <= 0) return '现在';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours >= 24) {
    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function getFiniteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function getObjectNumber(stats: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = getFiniteNumber(stats?.[key]);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function getCredentialStatus(account: AdminAccount) {
  if (typeof account.credentials_status === 'string') {
    return account.credentials_status.toLowerCase();
  }

  if (account.credentials_status && typeof account.credentials_status === 'object') {
    const record = account.credentials_status as Record<string, unknown>;
    return `${record.status ?? record.state ?? record.result ?? record.code ?? ''}`.toLowerCase();
  }

  return '';
}

function getAccountError(account: AdminAccount) {
  const status = `${account.status ?? ''}`.toLowerCase();
  const credentialsStatus = getCredentialStatus(account);
  const errorStatuses = ['error', 'failed', 'invalid', 'expired', 'unauthorized'];

  return errorStatuses.some((item) => status.includes(item) || credentialsStatus.includes(item));
}

function getAccountVisualStatus(account: AdminAccount): AccountVisualStatus {
  const normalizedStatus = `${account.status ?? ''}`.toLowerCase();
  const isPausedStatus = ['inactive', 'disabled', 'paused', 'stop', 'stopped'].includes(normalizedStatus);

  if (getAccountError(account)) {
    return { filterKey: 'error', label: '异常', badgeTone: 'danger' };
  }

  if (isPausedStatus || account.schedulable === false) {
    return { filterKey: 'paused', label: '暂停', badgeTone: 'muted' };
  }

  return { filterKey: 'active', label: '正常', badgeTone: 'success' };
}

function isOpenAiOauthAccount(account: AdminAccount) {
  return account.platform === 'openai' && account.type === 'oauth';
}

function getAccountTokens(stats: Record<string, unknown> | undefined) {
  const directTokens = getObjectNumber(stats, ['tokens', 'total_tokens', 'today_tokens']);

  if (directTokens !== undefined) {
    return directTokens;
  }

  const tokenParts = ['input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_creation_tokens'].map(
    (key) => getFiniteNumber(stats?.[key]) ?? 0
  );
  const sum = tokenParts.reduce((total, value) => total + value, 0);

  return sum > 0 ? sum : undefined;
}

function normalizeStats(stats?: Record<string, unknown>): Omit<AccountUsageSummary, 'isLoading' | 'hasError'> {
  return {
    requests: getObjectNumber(stats, ['requests', 'total_requests', 'request_count', 'today_requests']) ?? 0,
    tokens: getAccountTokens(stats) ?? 0,
    accountCost:
      getObjectNumber(stats, ['actual_cost', 'today_actual_cost', 'cost', 'total_actual_cost', 'total_cost', 'standard_cost']) ?? 0,
    userCost: getObjectNumber(stats, ['user_cost', 'total_user_cost']),
  };
}

function normalizeTodayStats(stats?: AccountTodayStats): Omit<AccountUsageSummary, 'isLoading' | 'hasError'> {
  return normalizeStats(stats);
}

function normalizeWindowStats(window: AccountUsageWindow | null | undefined): Omit<AccountUsageSummary, 'isLoading' | 'hasError'> {
  const stats = normalizeStats((window?.window_stats ?? undefined) as Record<string, unknown> | undefined);

  return {
    ...stats,
    utilization: getFiniteNumber(window?.utilization),
    resetsAt: typeof window?.resets_at === 'string' ? window.resets_at : null,
  };
}

function getStatsFromBatch(batch: AccountTodayStatsBatch | undefined, accountId: number) {
  const key = String(accountId);

  if (batch?.stats?.[key]) {
    return batch.stats[key];
  }

  if (batch?.accounts?.[key]) {
    return batch.accounts[key];
  }

  return batch?.items?.find((item) => item.account_id === accountId || item.id === accountId);
}

function getAccountGroupFilterKey(groupId: number): GroupFilter {
  return `group:${groupId}` as GroupFilter;
}

function accountMatchesGroup(account: AdminAccount, groupFilter: GroupFilter) {
  if (groupFilter === 'all') {
    return true;
  }

  const groups = account.groups ?? [];

  if (groupFilter === 'ungrouped') {
    return groups.length === 0 && (account.group_ids ?? []).length === 0;
  }

  const groupId = Number(groupFilter.replace('group:', ''));
  return groups.some((group) => group.id === groupId) || (account.group_ids ?? []).includes(groupId);
}

function getUsageFromAccountExtra(account: AdminAccount) {
  return normalizeStats({
    requests: account.extra?.today_requests ?? account.extra?.requests,
    tokens: account.extra?.today_tokens ?? account.extra?.tokens,
    cost: account.extra?.today_cost ?? account.extra?.cost,
    user_cost: account.extra?.today_user_cost ?? account.extra?.user_cost,
  });
}

function buildTodaySummary(
  account: AdminAccount,
  stats: AccountTodayStats | undefined,
  isLoading: boolean,
  hasError: boolean
): AccountUsageSummary {
  const fromBatch = normalizeTodayStats(stats);
  const fallback = getUsageFromAccountExtra(account);

  return {
    requests: fromBatch.requests || fallback.requests,
    tokens: fromBatch.tokens || fallback.tokens,
    accountCost: fromBatch.accountCost || fallback.accountCost,
    userCost: fromBatch.userCost ?? fallback.userCost,
    isLoading,
    hasError,
  };
}

function buildOauthWindowSummary(usage: AccountUsage | undefined, key: 'five_hour' | 'seven_day', isLoading: boolean, hasError: boolean) {
  const stats = normalizeWindowStats(usage?.[key]);

  return {
    ...stats,
    isLoading,
    hasError,
  };
}

function getSortMetric(account: AdminAccount, today: AccountUsageSummary | undefined, usage: AccountUsage | undefined) {
  if (isOpenAiOauthAccount(account)) {
    const sevenDay = normalizeWindowStats(usage?.seven_day);
    const fiveHour = normalizeWindowStats(usage?.five_hour);
    return {
      requests: sevenDay.requests || fiveHour.requests || today?.requests || 0,
      tokens: sevenDay.tokens || fiveHour.tokens || today?.tokens || 0,
    };
  }

  return {
    requests: today?.requests || 0,
    tokens: today?.tokens || 0,
  };
}

function getFeedbackTextClass(tone: TestFeedback['tone']) {
  if (tone === 'success') return 'text-xs text-[#15803d]';
  if (tone === 'danger') return 'text-xs text-[#b42318]';
  return 'text-xs text-[#667085]';
}

function WindowUsageRow({
  label,
  summary,
  tint,
}: {
  label: string;
  summary: AccountUsageSummary;
  tint: 'blue' | 'teal' | 'slate';
}) {
  const utilization = typeof summary.utilization === 'number' ? Math.round(summary.utilization) : undefined;
  const resetText = formatResetTime(summary.resetsAt);
  const barWidth = (typeof utilization === 'number' ? `${Math.max(2, Math.min(utilization, 100))}%` : '2%') as DimensionValue;
  const tintClass =
    tint === 'blue'
      ? 'bg-[#dbeafe] text-[#1d4ed8]'
      : tint === 'teal'
        ? 'bg-[#ccfbf1] text-[#0f766e]'
        : 'bg-[#e7edf4] text-[#35445c]';
  const barClass = utilization !== undefined && utilization >= 100 ? 'bg-[#ef4444]' : utilization !== undefined && utilization >= 80 ? 'bg-[#d97706]' : 'bg-[#16a34a]';

  return (
    <View className="rounded-[12px] bg-[#f8fbfd] px-3 py-2">
      {summary.isLoading ? (
        <Text className="text-xs text-[#667085]">{label} 加载中...</Text>
      ) : (
        <>
          <View className="flex-row flex-wrap items-center gap-1.5">
            <Text className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${tintClass}`}>{label}</Text>
            <Text className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#35445c]">
              {formatCompactNumber(summary.requests, 0)} req
            </Text>
            <Text className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#35445c]">{formatTokenValue(summary.tokens)}</Text>
            <Text className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#35445c]">A {formatMoney(summary.accountCost)}</Text>
            {summary.userCost !== undefined ? (
              <Text className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#35445c]">U {formatMoney(summary.userCost)}</Text>
            ) : null}
          </View>
          {utilization !== undefined ? (
            <View className="mt-2 flex-row items-center gap-2">
              <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#d8e0ea]">
                <View className={`h-full rounded-full ${barClass}`} style={{ width: barWidth }} />
              </View>
              <Text className="w-10 text-right text-[10px] font-semibold text-[#667085]">{utilization > 999 ? '>999%' : `${utilization}%`}</Text>
              {resetText ? <Text className="text-[10px] text-[#98a2b3]">{resetText}</Text> : null}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-[14px] bg-[#eef4f8] px-3 py-3">
      <Text className="text-[11px] text-[#667085]">{label}</Text>
      <Text className="mt-1 text-sm font-bold text-[#172033]">{value}</Text>
    </View>
  );
}

type AccountsListScreenProps = {
  safeAreaEdges?: Edge[];
};

export function AccountsListScreen({ safeAreaEdges }: AccountsListScreenProps) {
  const [searchText, setSearchText] = useState('');
  const [filter, setFilter] = useState<AccountStatusFilter>('all');
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
  const [usageSort, setUsageSort] = useState<UsageSort>('usage-desc');
  const [testingAccountId, setTestingAccountId] = useState<number | null>(null);
  const [refreshingAccountId, setRefreshingAccountId] = useState<number | null>(null);
  const [testFeedbackByAccountId, setTestFeedbackByAccountId] = useState<Record<number, TestFeedback>>({});
  const [refreshFeedbackByAccountId, setRefreshFeedbackByAccountId] = useState<Record<number, TestFeedback>>({});
  const [togglingAccountId, setTogglingAccountId] = useState<number | null>(null);
  const keyword = useDebouncedValue(searchText.trim(), 300);
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({
    queryKey: ['accounts', keyword],
    queryFn: () => listAccounts(keyword),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ accountId, schedulable }: { accountId: number; schedulable: boolean }) =>
      setAccountSchedulable(accountId, schedulable),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const testMutation = useMutation({
    mutationFn: async (account: AdminAccount) => {
      const result = await testAccountConnection(account);

      if (!result.success) {
        throw new Error(result.message);
      }

      await clearAccountError(account.id).catch(() => undefined);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: (accountId: number) => refreshAccount(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-today-stats-batch'] });
      queryClient.invalidateQueries({ queryKey: ['account-usage'] });
    },
  });

  const items = accountsQuery.data?.items ?? [];
  const totalAccounts = accountsQuery.data?.total ?? items.length;
  const accountIds = useMemo(() => items.map((account) => account.id), [items]);
  const oauthAccounts = useMemo(() => items.filter(isOpenAiOauthAccount), [items]);

  const accountStatsQuery = useQuery({
    queryKey: ['accounts-today-stats-batch', accountIds.join(',')],
    queryFn: () => getBatchAccountTodayStats(accountIds),
    enabled: accountIds.length > 0,
    staleTime: 60_000,
  });

  const usageQueries = useQueries({
    queries: oauthAccounts.map((account) => ({
      queryKey: ['account-usage', account.id],
      queryFn: () => getAccountUsage(account.id),
      staleTime: OAUTH_USAGE_STALE_TIME,
    })),
  });

  const todayByAccountId = useMemo(() => {
    const next = new Map<number, AccountUsageSummary>();
    items.forEach((account) => {
      next.set(
        account.id,
        buildTodaySummary(
          account,
          getStatsFromBatch(accountStatsQuery.data, account.id),
          accountStatsQuery.isLoading,
          Boolean(accountStatsQuery.error)
        )
      );
    });
    return next;
  }, [accountStatsQuery.data, accountStatsQuery.error, accountStatsQuery.isLoading, items]);

  const usageByAccountId = useMemo(() => {
    const next = new Map<number, { data?: AccountUsage; isLoading: boolean; hasError: boolean }>();
    oauthAccounts.forEach((account, index) => {
      const query = usageQueries[index];
      next.set(account.id, {
        data: query?.data,
        isLoading: Boolean(query?.isLoading),
        hasError: Boolean(query?.error),
      });
    });
    return next;
  }, [oauthAccounts, usageQueries]);

  const groupOptions = useMemo(() => {
    const grouped = new Map<number, { key: GroupFilter; name: string; count: number }>();
    let ungroupedCount = 0;

    items.forEach((account) => {
      const groups = account.groups ?? [];

      if (groups.length === 0) {
        ungroupedCount += 1;
        return;
      }

      groups.forEach((group) => {
        const current = grouped.get(group.id);
        grouped.set(group.id, {
          key: getAccountGroupFilterKey(group.id),
          name: group.name || `Group #${group.id}`,
          count: (current?.count ?? 0) + 1,
        });
      });
    });

    const options: Array<{ key: GroupFilter; name: string; count: number }> = [
      { key: 'all', name: '全部分组', count: totalAccounts },
      ...Array.from(grouped.values()).sort((left, right) => left.name.localeCompare(right.name)),
    ];

    if (ungroupedCount > 0) {
      options.push({ key: 'ungrouped', name: '未分组', count: ungroupedCount });
    }

    return options;
  }, [items, totalAccounts]);

  const groupMatchedItems = useMemo(
    () => items.filter((account) => accountMatchesGroup(account, groupFilter)),
    [groupFilter, items]
  );

  const filteredItems = useMemo(() => {
    const statusMatched = groupMatchedItems.filter((account) => {
      const visualStatus = getAccountVisualStatus(account);
      if (filter === 'all') return true;
      return visualStatus.filterKey === filter;
    });

    const sorted = [...statusMatched].sort((left, right) => {
      const leftMetric = getSortMetric(left, todayByAccountId.get(left.id), usageByAccountId.get(left.id)?.data);
      const rightMetric = getSortMetric(right, todayByAccountId.get(right.id), usageByAccountId.get(right.id)?.data);

      if (leftMetric.requests === rightMetric.requests) {
        return usageSort === 'usage-asc' ? leftMetric.tokens - rightMetric.tokens : rightMetric.tokens - leftMetric.tokens;
      }

      return usageSort === 'usage-asc' ? leftMetric.requests - rightMetric.requests : rightMetric.requests - leftMetric.requests;
    });

    return sorted;
  }, [filter, groupMatchedItems, todayByAccountId, usageByAccountId, usageSort]);

  const summary = useMemo(() => {
    const total = groupMatchedItems.length;
    const errors = groupMatchedItems.filter((item) => getAccountVisualStatus(item).filterKey === 'error').length;
    const paused = groupMatchedItems.filter((item) => getAccountVisualStatus(item).filterKey === 'paused').length;
    const active = groupMatchedItems.filter((item) => getAccountVisualStatus(item).filterKey === 'active').length;
    return { total, active, paused, errors };
  }, [groupMatchedItems]);

  const errorMessage = accountsQuery.error instanceof Error ? accountsQuery.error.message : '';

  const handleRefreshAll = useCallback(() => {
    void accountsQuery.refetch();
    void accountStatsQuery.refetch();
    void queryClient.invalidateQueries({ queryKey: ['account-usage'] });
  }, [accountStatsQuery, accountsQuery, queryClient]);

  const listHeader = useMemo(
    () => (
      <View className="pb-2">
        <View className="rounded-[20px] border border-[#d8e0ea] bg-white p-3">
          <View className="flex-row items-center rounded-[14px] bg-[#eef4f8] px-4 py-3">
            <Search color={colors.primary} size={18} />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="搜索账号名称 / 平台 / 分组"
              placeholderTextColor={colors.faint}
              className="ml-3 flex-1 text-base text-[#172033]"
            />
          </View>

          <View className="mt-3 flex-row flex-wrap gap-2">
            {groupOptions.map((option) => {
              const active = groupFilter === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => {
                    setGroupFilter(option.key);
                    setFilter('all');
                  }}
                  className={active ? 'rounded-full bg-[#0f766e] px-3 py-2' : 'rounded-full bg-[#eef4f8] px-3 py-2'}
                >
                  <Text className={active ? 'text-xs font-semibold text-white' : 'text-xs font-semibold text-[#35445c]'}>
                    {option.name} {option.count}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="mt-3 flex-row flex-wrap gap-2">
            {([
              ['all', `全部 ${summary.total}`],
              ['active', `正常 ${summary.active}`],
              ['paused', `暂停 ${summary.paused}`],
              ['error', `异常 ${summary.errors}`],
            ] as const).map(([key, label]) => {
              const active = filter === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setFilter(key)}
                  className={active ? 'rounded-full bg-[#2563eb] px-3 py-2' : 'rounded-full bg-[#eef4f8] px-3 py-2'}
                >
                  <Text className={active ? 'text-xs font-semibold text-white' : 'text-xs font-semibold text-[#35445c]'}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View className="mt-3 flex-row flex-wrap gap-2">
            {([
              ['usage-desc', '请求高->低'],
              ['usage-asc', '请求低->高'],
            ] as const).map(([key, label]) => {
              const active = usageSort === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setUsageSort(key)}
                  className={active ? 'rounded-full bg-[#243044] px-3 py-3' : 'rounded-full bg-[#eef4f8] px-3 py-3'}
                >
                  <Text className={active ? 'text-xs font-semibold text-white' : 'text-xs font-semibold text-[#35445c]'}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    ),
    [
      filter,
      groupFilter,
      groupOptions,
      searchText,
      summary.active,
      summary.errors,
      summary.paused,
      summary.total,
      usageSort,
    ]
  );

  const renderItem = useCallback(
    ({ item: account }: { item: (typeof filteredItems)[number] }) => {
      const isError = getAccountError(account);
      const visualStatus = getAccountVisualStatus(account);
      const groupsText = account.groups?.map((group) => group.name).filter(Boolean).slice(0, 3).join(' · ');
      const todayStats = todayByAccountId.get(account.id) ?? {
        requests: 0,
        tokens: 0,
        accountCost: 0,
        isLoading: false,
        hasError: false,
      };
      const usageQuery = usageByAccountId.get(account.id);
      const fiveHour = buildOauthWindowSummary(usageQuery?.data, 'five_hour', usageQuery?.isLoading ?? false, usageQuery?.hasError ?? false);
      const sevenDay = buildOauthWindowSummary(usageQuery?.data, 'seven_day', usageQuery?.isLoading ?? false, usageQuery?.hasError ?? false);
      const nextSchedulable = visualStatus.filterKey === 'paused';
      const toggleLabel = nextSchedulable ? '恢复' : '暂停';
      const testFeedback = testFeedbackByAccountId[account.id];
      const refreshFeedback = refreshFeedbackByAccountId[account.id];
      const isTogglingCurrent = togglingAccountId === account.id && toggleMutation.isPending;
      const isTestingCurrent = testingAccountId === account.id && testMutation.isPending;
      const isRefreshingCurrent = refreshingAccountId === account.id && refreshMutation.isPending;
      const showStoredError = isError && account.error_message;
      const isOauthUsage = isOpenAiOauthAccount(account);

      return (
        <View>
          <ListCard
            title={account.name}
            meta={`${account.platform} · ${account.type}`}
            badge={visualStatus.label}
            badgeTone={visualStatus.badgeTone}
            icon={KeyRound}
          >
            <View className="gap-3">
              <View className="flex-row flex-wrap items-center justify-between gap-2">
                <View className="flex-row items-center gap-2">
                  {account.schedulable !== false && !isError ? <ShieldCheck color={colors.success} size={14} /> : <ShieldOff color={colors.faint} size={14} />}
                  <Text className="text-sm text-[#667085]">状态：{visualStatus.label}</Text>
                </View>
                <Text className="text-xs text-[#667085]">最近使用 {formatTime(account.last_used_at || account.updated_at)}</Text>
              </View>

              {isOauthUsage ? (
                <View className="gap-2">
                  <WindowUsageRow label="5h" summary={fiveHour} tint="blue" />
                  <WindowUsageRow label="7d" summary={sevenDay} tint="teal" />
                  {usageQuery?.hasError ? <Text className="text-xs text-[#b42318]">OAuth 用量窗口加载失败，已保留账号状态。</Text> : null}
                </View>
              ) : (
                <>
                  <View className="flex-row gap-2">
                    <MetricTile label="请求次数" value={todayStats.isLoading ? '...' : formatCompactNumber(todayStats.requests, 0)} />
                    <MetricTile label="消费金额" value={todayStats.isLoading ? '...' : formatMoney(todayStats.accountCost)} />
                    <MetricTile label="token消耗" value={todayStats.isLoading ? '...' : formatTokenValue(todayStats.tokens)} />
                  </View>
                  {todayStats.userCost !== undefined ? (
                    <Text className="text-xs text-[#667085]">用户计费 {formatMoney(todayStats.userCost)}</Text>
                  ) : null}
                  {todayStats.hasError ? <Text className="text-xs text-[#b42318]">今日统计加载失败，已按 0 显示。</Text> : null}
                </>
              )}

              <Text className="text-xs text-[#667085]">优先级 {account.priority ?? 0} · 倍率 {(account.rate_multiplier ?? 1).toFixed(2)}x</Text>

              {groupsText ? <Text className="text-xs text-[#667085]">分组 {groupsText}</Text> : null}
              {showStoredError ? <Text className="text-xs text-[#b42318]">异常信息：{account.error_message}</Text> : null}

              <View className="flex-row flex-wrap gap-2">
                <Pressable
                  className={isTestingCurrent ? 'rounded-full bg-[#dbeafe] px-4 py-2 opacity-80' : 'rounded-full bg-[#243044] px-4 py-2'}
                  disabled={isTestingCurrent}
                  onPress={(event) => {
                    event.stopPropagation();
                    setTestingAccountId(account.id);
                    setTestFeedbackByAccountId((current) => ({
                      ...current,
                      [account.id]: { message: '按网页检测方式连接中...', tone: 'muted' },
                    }));
                    testMutation.mutate(account, {
                      onSuccess: (result) => {
                        setTestFeedbackByAccountId((current) => ({
                          ...current,
                          [account.id]: { message: result.message, tone: 'success' },
                        }));
                      },
                      onError: (error) => {
                        const message = error instanceof Error && error.message ? error.message : '检测失败';
                        setTestFeedbackByAccountId((current) => ({
                          ...current,
                          [account.id]: { message, tone: 'danger' },
                        }));
                      },
                      onSettled: () => {
                        setTestingAccountId((current) => (current === account.id ? null : current));
                      },
                    });
                  }}
                >
                  <Text className={isTestingCurrent ? 'text-xs font-semibold text-[#1d4ed8]' : 'text-xs font-semibold text-white'}>
                    {isTestingCurrent ? '检测中...' : '测试'}
                  </Text>
                </Pressable>
                <Pressable
                  className="rounded-full bg-[#dbeafe] px-4 py-2"
                  disabled={isRefreshingCurrent}
                  onPress={(event) => {
                    event.stopPropagation();
                    setRefreshingAccountId(account.id);
                    refreshMutation.mutate(account.id, {
                      onSuccess: () => {
                        setRefreshFeedbackByAccountId((current) => ({
                          ...current,
                          [account.id]: { message: '刷新成功', tone: 'success' },
                        }));
                      },
                      onError: (error) => {
                        const message = error instanceof Error && error.message ? error.message : '刷新失败';
                        setRefreshFeedbackByAccountId((current) => ({
                          ...current,
                          [account.id]: { message, tone: 'danger' },
                        }));
                      },
                      onSettled: () => {
                        setRefreshingAccountId((current) => (current === account.id ? null : current));
                      },
                    });
                  }}
                >
                  <Text className="text-xs font-semibold text-[#1d4ed8]">{isRefreshingCurrent ? '刷新中...' : '刷新'}</Text>
                </Pressable>
                <Pressable
                  className="rounded-full bg-[#eef4f8] px-4 py-2"
                  disabled={isTogglingCurrent}
                  onPress={(event) => {
                    event.stopPropagation();
                    setTogglingAccountId(account.id);
                    toggleMutation.mutate(
                      {
                        accountId: account.id,
                        schedulable: nextSchedulable,
                      },
                      {
                        onSettled: () => {
                          setTogglingAccountId((current) => (current === account.id ? null : current));
                        },
                      }
                    );
                  }}
                >
                  <Text className="text-xs font-semibold text-[#35445c]">{isTogglingCurrent ? '处理中...' : toggleLabel}</Text>
                </Pressable>
              </View>

              {testFeedback ? <Text className={getFeedbackTextClass(testFeedback.tone)}>检测结果：{testFeedback.message}</Text> : null}
              {refreshFeedback ? <Text className={getFeedbackTextClass(refreshFeedback.tone)}>刷新结果：{refreshFeedback.message}</Text> : null}
            </View>
          </ListCard>
        </View>
      );
    },
    [
      refreshFeedbackByAccountId,
      refreshMutation,
      refreshingAccountId,
      testFeedbackByAccountId,
      testMutation,
      testingAccountId,
      todayByAccountId,
      toggleMutation,
      togglingAccountId,
      usageByAccountId,
    ]
  );

  const emptyState = useMemo(
    () => <ListCard title="暂无账号" meta={errorMessage || '连上后台后这里会展示账号列表。'} icon={KeyRound} />,
    [errorMessage]
  );

  return (
    <ScreenShell
      title="账号清单"
      subtitle="查看名称、平台和类型、分组、请求次数、消费金额、token 消耗，并支持筛选、排序与网页同口径检测。"
      titleAside={(
        <Text numberOfLines={2} className="min-w-0 flex-1 text-[11px] leading-4 text-[#667085]" style={{ flexShrink: 1 }}>
          OpenAI OAuth 使用 5h / 7d 窗口，API Key 使用今日统计。
        </Text>
      )}
      variant="minimal"
      scroll={false}
      safeAreaEdges={safeAreaEdges}
      bottomInsetClassName="pb-6"
      contentGapClassName="mt-2 gap-2"
    >
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 12, flexGrow: 1 }}
        data={filteredItems}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.id}`}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={accountsQuery.isRefetching} onRefresh={handleRefreshAll} tintColor={colors.primary} />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyState}
        ItemSeparatorComponent={() => <View className="h-4" />}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
      />
    </ScreenShell>
  );
}
