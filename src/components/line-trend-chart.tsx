import { useMemo } from 'react';
import { Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { colors, shadows } from '@/src/theme/colors';

type Point = {
  label: string;
  value: number;
};

type LineTrendChartProps = {
  points: Point[];
  color?: string;
  title: string;
  subtitle: string;
  formatValue?: (value: number) => string;
  compact?: boolean;
};

export function LineTrendChart({
  points,
  color = colors.primary,
  title,
  subtitle,
  formatValue = (value) => `${value}`,
  compact = false,
}: LineTrendChartProps) {
  const width = 320;
  const height = compact ? 104 : 144;
  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const minValue = Math.min(...points.map((point) => point.value), 0);
  const range = Math.max(maxValue - minValue, 1);
  const gradientId = useMemo(
    () => `trendFill-${title.replace(/[^a-zA-Z0-9_-]/g, '')}-${compact ? 'compact' : 'full'}`,
    [compact, title]
  );

  const line = points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((point.value - minValue) / range) * (height - 18) - 12;

      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  const latest = points[points.length - 1]?.value ?? 0;
  const maxTicks = compact ? 6 : 7;
  const tickStep = Math.max(Math.ceil(points.length / maxTicks), 1);
  const tickPoints = points.filter((_, index) => index === 0 || index === points.length - 1 || index % tickStep === 0);

  return (
    <View className="rounded-[18px] border bg-white p-4" style={{ borderColor: colors.border, boxShadow: shadows.subtle }}>
      <Text className="text-xs font-semibold text-[#2563eb]">{title}</Text>
      <Text className={`mt-1 font-bold text-[#172033] ${compact ? 'text-[22px]' : 'text-[28px]'}`}>{formatValue(latest)}</Text>
      <Text numberOfLines={1} className="mt-1 text-xs font-medium text-[#667085]">{subtitle}</Text>

      <View className={`overflow-hidden rounded-[16px] bg-[#eef4f8] p-3 ${compact ? 'mt-3' : 'mt-4'}`}>
        <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <Stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </LinearGradient>
          </Defs>
          <Path d={area} fill={`url(#${gradientId})`} />
          <Path d={line} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        </Svg>

        <View className="mt-2 flex-row justify-between">
          {tickPoints.map((point, index) => (
            <Text key={`${point.label}-${index}`} className={`font-semibold text-[#64748b] ${compact ? 'text-[10px]' : 'text-xs'}`}>
              {point.label}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}
