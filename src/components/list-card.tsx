import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { colors, shadows } from '@/src/theme/colors';

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
    wrap: 'rounded-full bg-[#dbeafe] px-2.5 py-1',
    text: 'text-[10px] font-semibold text-[#1d4ed8]',
  },
  success: {
    wrap: 'rounded-full bg-[#dcfce7] px-2.5 py-1',
    text: 'text-[10px] font-semibold text-[#15803d]',
  },
  muted: {
    wrap: 'rounded-full bg-[#e7edf4] px-2.5 py-1',
    text: 'text-[10px] font-semibold text-[#475467]',
  },
  danger: {
    wrap: 'rounded-full bg-[#fee4e2] px-2.5 py-1',
    text: 'text-[10px] font-semibold text-[#b42318]',
  },
};

const accentColorMap: Record<NonNullable<ListCardProps['badgeTone']>, string> = {
  default: colors.primary,
  success: colors.success,
  muted: colors.faint,
  danger: colors.danger,
};

export function ListCard({ title, meta, badge, badgeTone = 'default', children, icon: Icon }: ListCardProps) {
  const badgeClass = badgeClassMap[badgeTone];

  return (
    <View
      className="rounded-[18px] border bg-white p-4"
      style={{ borderColor: colors.border, borderLeftWidth: 3, borderLeftColor: accentColorMap[badgeTone], boxShadow: shadows.subtle }}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            {Icon ? <Icon color={accentColorMap[badgeTone]} size={16} /> : null}
            <Text className="text-base font-semibold text-[#172033]">{title}</Text>
          </View>
          {meta ? <Text numberOfLines={1} className="mt-1 text-xs text-[#667085]">{meta}</Text> : null}
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
