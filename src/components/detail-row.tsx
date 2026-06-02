import { Text, View } from 'react-native';

type DetailRowProps = {
  label: string;
  value: string;
};

export function DetailRow({ label, value }: DetailRowProps) {
  return (
    <View className="flex-row items-start justify-between gap-4 border-b border-[#e7edf4] py-3 last:border-b-0">
      <Text className="text-sm text-[#667085]">{label}</Text>
      <Text className="max-w-[62%] text-right text-sm font-medium text-[#172033]">{value}</Text>
    </View>
  );
}
