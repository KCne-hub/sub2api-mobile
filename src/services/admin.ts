import { adminFetch, adminRawFetch } from '@/src/lib/admin-fetch';
import type {
  AccountAvailableModel,
  AccountTestEvent,
  AccountTestResult,
  AccountTodayStats,
  AccountTodayStatsBatch,
  AccountUsage,
  AdminAccount,
  AdminApiKey,
  ApiKeyUsageBatch,
  AdminGroup,
  AdminProxy,
  ProxyQualityCheckResult,
  ChannelMonitor,
  ChannelMonitorHistoryItem,
  ChannelMonitorRunResult,
  AdminSettings,
  AdminUser,
  BalanceOperation,
  DashboardModelStats,
  DashboardSnapshot,
  DashboardStats,
  DashboardTrend,
  CreateAccountRequest,
  CreateUserRequest,
  PaginatedData,
  UsageStats,
  UserUsageSummary,
} from '@/src/types/admin';

function buildQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });

  const value = query.toString();

  return value ? `?${value}` : '';
}

export function getDashboardStats() {
  return adminFetch<DashboardStats>('/api/v1/admin/dashboard/stats');
}

export function getAdminSettings() {
  return adminFetch<AdminSettings>('/api/v1/admin/settings');
}

export function getDashboardTrend(params: {
  start_date: string;
  end_date: string;
  granularity?: 'day' | 'hour';
  account_id?: number;
  group_id?: number;
  user_id?: number;
}) {
  return adminFetch<DashboardTrend>(`/api/v1/admin/dashboard/trend${buildQuery(params)}`);
}

export function getDashboardModels(params: { start_date: string; end_date: string }) {
  return adminFetch<DashboardModelStats>(`/api/v1/admin/dashboard/models${buildQuery(params)}`);
}

export function getDashboardSnapshot(params: {
  start_date: string;
  end_date: string;
  granularity?: 'day' | 'hour';
  account_id?: number;
  user_id?: number;
  group_id?: number;
  model?: string;
  request_type?: string;
  billing_type?: string | null;
  include_stats?: boolean;
  include_trend?: boolean;
  include_model_stats?: boolean;
  include_group_stats?: boolean;
  include_users_trend?: boolean;
}) {
  return adminFetch<DashboardSnapshot>(`/api/v1/admin/dashboard/snapshot-v2${buildQuery(params)}`);
}

export function getUsageStats(params: {
  start_date: string;
  end_date: string;
  user_id?: number;
  account_id?: number;
  group_id?: number;
  model?: string;
  request_type?: string;
  billing_type?: string | null;
}) {
  return adminFetch<UsageStats>(`/api/v1/admin/usage/stats${buildQuery(params)}`);
}

export function listUsers(search = '') {
  return adminFetch<PaginatedData<AdminUser>>(
    `/api/v1/admin/users${buildQuery({ page: 1, page_size: 20, search: search.trim() })}`
  );
}

export function getUser(userId: number) {
  return adminFetch<AdminUser>(`/api/v1/admin/users/${userId}`);
}

export function createUser(body: CreateUserRequest) {
  return adminFetch<AdminUser>('/api/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getUserUsage(userId: number, period: 'day' | 'week' | 'month' = 'month') {
  return adminFetch<UserUsageSummary>(`/api/v1/admin/users/${userId}/usage${buildQuery({ period })}`);
}

export function listUserApiKeys(userId: number) {
  return adminFetch<PaginatedData<AdminApiKey>>(`/api/v1/admin/users/${userId}/api-keys${buildQuery({ page: 1, page_size: 100 })}`);
}

export function getBatchApiKeysUsage(apiKeyIds: number[]) {
  return adminFetch<ApiKeyUsageBatch>('/api/v1/admin/dashboard/api-keys-usage', {
    method: 'POST',
    body: JSON.stringify({ api_key_ids: apiKeyIds }),
  });
}

export function updateUserBalance(
  userId: number,
  body: { balance: number; operation: BalanceOperation; notes?: string }
) {
  return adminFetch<AdminUser>(
    `/api/v1/admin/users/${userId}/balance`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    {
      idempotencyKey: `user-balance-${userId}-${Date.now()}`,
    }
  );
}

export function updateUserStatus(userId: number, status: 'active' | 'disabled') {
  return adminFetch<AdminUser>(`/api/v1/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

export function listGroups(search = '') {
  return adminFetch<PaginatedData<AdminGroup>>(
    `/api/v1/admin/groups${buildQuery({ page: 1, page_size: 20, search: search.trim() })}`
  );
}

export function getGroup(groupId: number) {
  return adminFetch<AdminGroup>(`/api/v1/admin/groups/${groupId}`);
}

export async function listAccounts(search = '') {
  const pageSize = 100;
  const firstPage = await adminFetch<PaginatedData<AdminAccount>>(
    `/api/v1/admin/accounts${buildQuery({ page: 1, page_size: pageSize, search: search.trim() })}`
  );

  if ((firstPage.pages ?? 1) <= 1) {
    return firstPage;
  }

  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.pages - 1 }, (_, index) =>
      adminFetch<PaginatedData<AdminAccount>>(
        `/api/v1/admin/accounts${buildQuery({ page: index + 2, page_size: pageSize, search: search.trim() })}`
      )
    )
  );

  return {
    ...firstPage,
    items: [firstPage.items, ...remainingPages.map((page) => page.items)].flat(),
  };
}

export function listChannelMonitors() {
  return adminFetch<PaginatedData<ChannelMonitor>>(
    `/api/v1/admin/channel-monitors${buildQuery({ page: 1, page_size: 100 })}`
  );
}

export function getChannelMonitorHistory(monitorId: number) {
  return adminFetch<{ items: ChannelMonitorHistoryItem[] }>(
    `/api/v1/admin/channel-monitors/${monitorId}/history${buildQuery({ page: 1, page_size: 120 })}`
  );
}

export function runChannelMonitor(monitorId: number) {
  return adminFetch<ChannelMonitorRunResult>(`/api/v1/admin/channel-monitors/${monitorId}/run`, {
    method: 'POST',
  });
}

export function listProxies(search = '') {
  return adminFetch<PaginatedData<AdminProxy>>(
    `/api/v1/admin/proxies${buildQuery({ page: 1, page_size: 50, search: search.trim() })}`
  );
}

export function checkProxyQuality(proxyId: number) {
  return adminFetch<ProxyQualityCheckResult>(`/api/v1/admin/proxies/${proxyId}/quality-check`, {
    method: 'POST',
  });
}

export function getAccount(accountId: number) {
  return adminFetch<AdminAccount>(`/api/v1/admin/accounts/${accountId}`);
}

export function createAccount(body: CreateAccountRequest) {
  return adminFetch<AdminAccount>('/api/v1/admin/accounts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getAccountTodayStats(accountId: number) {
  return adminFetch<AccountTodayStats>(`/api/v1/admin/accounts/${accountId}/today-stats`);
}

export function getBatchAccountTodayStats(accountIds: number[]) {
  return adminFetch<AccountTodayStatsBatch>('/api/v1/admin/accounts/today-stats/batch', {
    method: 'POST',
    body: JSON.stringify({ account_ids: accountIds }),
  });
}

export function getAccountUsage(accountId: number, source?: string, force = false) {
  return adminFetch<AccountUsage>(
    `/api/v1/admin/accounts/${accountId}/usage${buildQuery({
      source,
      force: force ? 'true' : undefined,
    })}`
  );
}

export function getAccountAvailableModels(accountId: number) {
  return adminFetch<AccountAvailableModel[]>(`/api/v1/admin/accounts/${accountId}/models`);
}

export function clearAccountError(accountId: number) {
  return adminFetch(`/api/v1/admin/accounts/${accountId}/clear-error`, {
    method: 'POST',
  });
}

export function testAccount(accountId: number) {
  return adminFetch(`/api/v1/admin/accounts/${accountId}/test`, {
    method: 'POST',
  });
}

function getTestEventMessage(event: AccountTestEvent) {
  if (event.error) {
    return event.error;
  }

  if (event.success === true) {
    return '检测成功';
  }

  return '检测失败';
}

function pickDefaultModel(models: AccountAvailableModel[], platform: string) {
  if (models.length === 0) {
    return '';
  }

  if (platform === 'gemini') {
    return models[0].id;
  }

  return models.find((model) => model.id.toLowerCase().includes('sonnet'))?.id ?? models[0].id;
}

function parseSseLines(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice(6).trim())
    .filter(Boolean);
}

export async function testAccountConnection(account: Pick<AdminAccount, 'id' | 'platform'>) {
  const models = await getAccountAvailableModels(account.id).catch(() => []);
  const modelId = pickDefaultModel(models, account.platform);

  if (!modelId) {
    throw new Error('没有可用模型，无法按网页方式检测');
  }

  const response = await adminRawFetch(`/api/v1/admin/accounts/${account.id}/test`, {
    method: 'POST',
    body: JSON.stringify({
      model_id: modelId,
      prompt: '',
    }),
  });

  const rawText = await response.text();

  if (!response.ok) {
    throw new Error(rawText || `HTTP ${response.status}`);
  }

  const events: AccountTestEvent[] = [];

  for (const payload of parseSseLines(rawText)) {
    try {
      events.push(JSON.parse(payload) as AccountTestEvent);
    } catch {
      // Ignore malformed stream fragments; the final status event is what matters.
    }
  }

  const finalEvent =
    [...events].reverse().find((event) => event.type === 'test_complete' || event.type === 'error') ??
    events[events.length - 1];
  const content = events
    .filter((event) => event.type === 'content' && typeof event.text === 'string')
    .map((event) => event.text)
    .join('')
    .trim();
  const success = finalEvent?.type === 'test_complete' && finalEvent.success === true;

  if (!finalEvent) {
    throw new Error('检测没有返回结果');
  }

  return {
    success,
    model: finalEvent.model ?? modelId,
    message: success ? `检测成功 · ${modelId}` : getTestEventMessage(finalEvent),
    text: content,
    events,
  } satisfies AccountTestResult;
}

export function refreshAccount(accountId: number) {
  return adminFetch(`/api/v1/admin/accounts/${accountId}/refresh`, {
    method: 'POST',
  });
}

export function setAccountSchedulable(accountId: number, schedulable: boolean) {
  return adminFetch<AdminAccount>(`/api/v1/admin/accounts/${accountId}/schedulable`, {
    method: 'POST',
    body: JSON.stringify({ schedulable }),
  });
}
