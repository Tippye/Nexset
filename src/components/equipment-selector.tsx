import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  Alert,
  type ImageSourcePropType,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Circle, Ellipse, Line, Rect } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Input } from '@/components/ui-kit';
import { Radii, Spacing } from '@/constants/theme';
import {
  DEFAULT_GYM_EQUIPMENT_IDS,
  GYM_EQUIPMENT_CATALOG,
  MUSCLE_GROUP_LABELS,
  type EquipmentMuscleGroup,
  type GymEquipmentId,
} from '@/data/gym-equipment';
import { useTheme } from '@/hooks/use-theme';

const EQUIPMENT_IMAGES: Record<GymEquipmentId, ImageSourcePropType> = {
  barbell: require('@/assets/images/equipment/barbell.png'),
  dumbbells: require('@/assets/images/equipment/dumbbells.png'),
  smith_machine: require('@/assets/images/equipment/smith-machine.png'),
  cable_machine: require('@/assets/images/equipment/cable-machine.png'),
  leg_press: require('@/assets/images/equipment/leg-press.png'),
  kettlebell: require('@/assets/images/equipment/kettlebell.png'),
  treadmill: require('@/assets/images/equipment/treadmill.png'),
  rowing_machine: require('@/assets/images/equipment/rowing-machine.png'),
};

export function EquipmentSelector({
  selectedIds,
  onChange,
  showRecognition = true,
}: {
  selectedIds: GymEquipmentId[];
  onChange: (ids: GymEquipmentId[]) => void;
  showRecognition?: boolean;
}) {
  const theme = useTheme();
  const [keyword, setKeyword] = useState('');
  const [pendingAsset, setPendingAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);

  const normalizedKeyword = keyword.trim().toLowerCase();
  const items = normalizedKeyword
    ? GYM_EQUIPMENT_CATALOG.filter(
        (item) =>
          item.nameZh.includes(normalizedKeyword) ||
          item.nameEn.toLowerCase().includes(normalizedKeyword),
      )
    : GYM_EQUIPMENT_CATALOG;

  function toggle(id: GymEquipmentId) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((item) => item !== id)
        : [...selectedIds, id],
    );
  }

  async function pickMedia(kind: 'image' | 'video') {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('需要照片权限', '允许访问媒体库后，才能选择器材图片或视频。');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: kind === 'image' ? ['images'] : ['videos'],
        allowsEditing: false,
        quality: kind === 'image' ? 0.8 : 1,
      });
      if (!result.canceled) setPendingAsset(result.assets[0]);
    } catch {
      Alert.alert('无法打开媒体库', '请稍后重试或检查系统权限设置。');
    }
  }

  return (
    <View>
      <View style={styles.toolbar}>
        <ThemedText type="small" themeColor="textSecondary">
          已选 {selectedIds.length} 项
        </ThemedText>
        <View style={styles.toolbarActions}>
          <Pressable onPress={() => onChange([...DEFAULT_GYM_EQUIPMENT_IDS])}>
            <ThemedText type="smallBold" style={{ color: theme.chart1 }}>
              全选
            </ThemedText>
          </Pressable>
          <Pressable onPress={() => onChange([])}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              清空
            </ThemedText>
          </Pressable>
        </View>
      </View>

      <Input
        value={keyword}
        onChangeText={setKeyword}
        placeholder="搜索器材名称"
        style={styles.searchInput}
      />

      <View style={styles.grid}>
        {items.map((item) => {
          const selected = selectedIds.includes(item.id);
          return (
            <Pressable
              key={item.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${item.nameZh}，适用${item.muscles.map((muscle) => MUSCLE_GROUP_LABELS[muscle]).join('、')}`}
              onPress={() => toggle(item.id)}
              style={({ pressed }) => [
                styles.equipmentCard,
                {
                  backgroundColor: theme.card,
                  borderColor: selected ? theme.chart1 : theme.border,
                  opacity: pressed ? 0.82 : 1,
                },
              ]}>
              <View style={[styles.imageFrame, { backgroundColor: theme.accentSoft }]}>
                <Image
                  source={EQUIPMENT_IMAGES[item.id]}
                  style={styles.equipmentImage}
                  contentFit="cover"
                />
                <View
                  style={[
                    styles.selectionMark,
                    {
                      backgroundColor: selected ? theme.chart1 : `${theme.card}E8`,
                      borderColor: selected ? theme.chart1 : theme.border,
                    },
                  ]}>
                  <Ionicons
                    name={selected ? 'checkmark' : 'add'}
                    size={16}
                    color={selected ? '#FFFFFF' : theme.textSecondary}
                  />
                </View>
              </View>
              <ThemedText type="smallBold" numberOfLines={1} style={styles.equipmentName}>
                {item.nameZh}
              </ThemedText>
              <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                {item.nameEn}
              </ThemedText>
              <View style={styles.muscleRow}>
                {item.muscles.map((muscle) => (
                  <MuscleBadge key={muscle} muscle={muscle} />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>

      {items.length === 0 ? (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <ThemedText type="small" themeColor="textSecondary">
            没有匹配的器材，可尝试搜索中文或英文名称。
          </ThemedText>
        </View>
      ) : null}

      {showRecognition ? (
        <View style={[styles.recognitionPanel, { borderColor: theme.border }]}>
          <View style={styles.recognitionTitleRow}>
            <View style={[styles.sparkIcon, { backgroundColor: `${theme.chart1}18` }]}>
              <Ionicons name="scan-outline" size={18} color={theme.chart1} />
            </View>
            <View style={styles.recognitionCopy}>
              <ThemedText type="smallBold">智能识别器材</ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                图片识别单个器材，视频识别场地内多个器材
              </ThemedText>
            </View>
            <View style={[styles.pendingBadge, { backgroundColor: theme.muted }]}>
              <ThemedText type="caption" themeColor="textSecondary">
                模型待接入
              </ThemedText>
            </View>
          </View>

          <View style={styles.recognitionActions}>
            <MediaButton
              icon="image-outline"
              label="上传图片"
              hint="识别单个器材"
              onPress={() => void pickMedia('image')}
            />
            <MediaButton
              icon="videocam-outline"
              label="上传视频"
              hint="识别多个器材"
              onPress={() => void pickMedia('video')}
            />
          </View>

          {pendingAsset ? (
            <View style={[styles.pendingPreview, { backgroundColor: theme.muted }]}>
              {pendingAsset.type === 'image' ? (
                <Image source={{ uri: pendingAsset.uri }} style={styles.pendingImage} contentFit="cover" />
              ) : (
                <View style={[styles.pendingVideo, { backgroundColor: theme.card }]}>
                  <Ionicons name="film-outline" size={24} color={theme.chart1} />
                </View>
              )}
              <View style={styles.pendingInfo}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {pendingAsset.fileName ?? (pendingAsset.type === 'video' ? '已选择视频' : '已选择图片')}
                </ThemedText>
                <ThemedText type="caption" themeColor="textSecondary">
                  素材已就绪；接入识别模型后会自动生成候选器材列表。
                </ThemedText>
              </View>
              <Pressable accessibilityLabel="移除待识别素材" onPress={() => setPendingAsset(null)}>
                <Ionicons name="close-circle" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function MediaButton({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.mediaButton,
        {
          backgroundColor: pressed ? theme.accentSurface : theme.card,
          borderColor: theme.border,
        },
      ]}>
      <Ionicons name={icon} size={21} color={theme.chart1} />
      <View>
        <ThemedText type="smallBold">{label}</ThemedText>
        <ThemedText type="caption" themeColor="textSecondary">
          {hint}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function MuscleBadge({ muscle }: { muscle: EquipmentMuscleGroup }) {
  const theme = useTheme();
  return (
    <View style={[styles.muscleBadge, { backgroundColor: theme.muted }]}>
      <MuscleFigure muscle={muscle} />
      <ThemedText type="caption" themeColor="textSecondary">
        {MUSCLE_GROUP_LABELS[muscle]}
      </ThemedText>
    </View>
  );
}

function MuscleFigure({ muscle }: { muscle: EquipmentMuscleGroup }) {
  const theme = useTheme();
  const base = theme.textSecondary;
  const active = muscle === 'cardio' ? theme.danger : theme.chart1;
  const full = muscle === 'full_body' || muscle === 'cardio';
  const torsoActive = full || muscle === 'chest' || muscle === 'back';
  const armActive = full || muscle === 'arms' || muscle === 'shoulders';
  const legActive = full || muscle === 'legs' || muscle === 'glutes';

  return (
    <Svg width={17} height={24} viewBox="0 0 17 24">
      <Circle cx="8.5" cy="3" r="2" fill={full ? active : base} opacity={full ? 1 : 0.55} />
      <Rect
        x="5.5"
        y="5.5"
        width="6"
        height="8"
        rx="2.5"
        fill={torsoActive ? active : base}
        opacity={torsoActive ? 1 : 0.4}
      />
      {muscle === 'core' ? <Rect x="6.5" y="9" width="4" height="4" rx="1" fill={active} /> : null}
      {muscle === 'shoulders' ? (
        <>
          <Circle cx="5.2" cy="6.8" r="1.6" fill={active} />
          <Circle cx="11.8" cy="6.8" r="1.6" fill={active} />
        </>
      ) : null}
      {muscle === 'glutes' ? <Ellipse cx="8.5" cy="13" rx="3.2" ry="1.8" fill={active} /> : null}
      <Line x1="5.7" y1="7" x2="2.5" y2="13" stroke={armActive ? active : base} strokeWidth="1.8" strokeLinecap="round" opacity={armActive ? 1 : 0.45} />
      <Line x1="11.3" y1="7" x2="14.5" y2="13" stroke={armActive ? active : base} strokeWidth="1.8" strokeLinecap="round" opacity={armActive ? 1 : 0.45} />
      <Line x1="7" y1="13" x2="5.2" y2="21" stroke={legActive ? active : base} strokeWidth="2" strokeLinecap="round" opacity={legActive ? 1 : 0.45} />
      <Line x1="10" y1="13" x2="11.8" y2="21" stroke={legActive ? active : base} strokeWidth="2" strokeLinecap="round" opacity={legActive ? 1 : 0.45} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  toolbarActions: { flexDirection: 'row', gap: Spacing.three },
  searchInput: { marginBottom: Spacing.three },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.twoHalf },
  equipmentCard: {
    width: '48%',
    minWidth: 142,
    flexGrow: 1,
    maxWidth: 356,
    borderWidth: 1.5,
    borderRadius: Radii.lg,
    padding: Spacing.two,
  },
  imageFrame: {
    height: 116,
    overflow: 'hidden',
    borderRadius: Radii.md,
  },
  equipmentImage: { width: '100%', height: '100%' },
  selectionMark: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 27,
    height: 27,
    borderWidth: 1,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  equipmentName: { marginTop: Spacing.two },
  muscleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: Spacing.two },
  muscleBadge: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: Radii.full,
    paddingVertical: 2,
    paddingLeft: 4,
    paddingRight: 7,
  },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Radii.md,
    padding: Spacing.three,
    alignItems: 'center',
  },
  recognitionPanel: {
    marginTop: Spacing.three,
    padding: Spacing.three,
    borderWidth: 1,
    borderRadius: Radii.lg,
  },
  recognitionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sparkIcon: {
    width: 36,
    height: 36,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recognitionCopy: { flex: 1 },
  pendingBadge: { borderRadius: Radii.full, paddingHorizontal: 8, paddingVertical: 4 },
  recognitionActions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
  mediaButton: {
    flex: 1,
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.twoHalf,
    borderWidth: 1,
    borderRadius: Radii.md,
  },
  pendingPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
    borderRadius: Radii.md,
    padding: Spacing.two,
  },
  pendingImage: { width: 52, height: 52, borderRadius: Radii.sm },
  pendingVideo: {
    width: 52,
    height: 52,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingInfo: { flex: 1 },
});
