import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

type ListCardProps = {
  title: string;
  meta?: string;
  badge?: string;
  badgeTone?: 'default' | 'success' | 'muted' | 'danger';
  children?: ReactNode;
  icon?: LucideIcon;
};

const badgeClassMap: Record<NonNullable<ListCardProps['badgeTone']>, { wrap: string; text: string }> = {
  default: {
    wrap: 'rounded-full bg-[#eef2ff] px-2.5 py-1',
    text: 'text-[10px] font-semibold uppercase tracking-[1px] text-[#4338ca]',
  },
  success: {
    wrap: 'rounded-full bg-[#dcfce7] px-2.5 py-1',
    text: 'text-[10px] font-semibold uppercase tracking-[1px] text-[#166534]',
  },
  muted: {
    wrap: 'rounded-full bg-[#e2e8f0] px-2.5 py-1',
    text: 'text-[10px] font-semibold uppercase tracking-[1px] text-[#475569]',
  },
  danger: {
    wrap: 'rounded-full bg-[#ffe4e6] px-2.5 py-1',
    text: 'text-[10px] font-semibold uppercase tracking-[1px] text-[#be123c]',
  },
};

const accentColorMap: Record<NonNullable<ListCardProps['badgeTone']>, string> = {
  default: '#6366f1',
  success: '#22c55e',
  muted: '#94a3b8',
  danger: '#f43f5e',
};

export function ListCard({ title, meta, badge, badgeTone = 'default', children, icon: Icon }: ListCardProps) {
  const badgeClass = badgeClassMap[badgeTone];

  return (
    <View
      className="rounded-[20px] border border-[#dbeafe] bg-white p-4"
      style={{ borderLeftWidth: 4, borderLeftColor: accentColorMap[badgeTone] }}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            {Icon ? <Icon color={accentColorMap[badgeTone]} size={16} /> : null}
            <Text className="text-base font-semibold text-[#0f172a]">{title}</Text>
          </View>
          {meta ? <Text numberOfLines={1} className="mt-1 text-xs text-[#64748b]">{meta}</Text> : null}
        </View>
        {badge ? (
          <View className={badgeClass.wrap}>
            <Text className={badgeClass.text}>{badge}</Text>
          </View>
        ) : null}
      </View>
      {children ? <View className="mt-3">{children}</View> : null}
    </View>
  );
}
