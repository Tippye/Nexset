import type { Equipment } from '@/db/repositories/exercise-repo';

export type TrainingLocation = 'gym' | 'home' | 'bodyweight';

export type EquipmentMuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'arms'
  | 'core'
  | 'legs'
  | 'glutes'
  | 'full_body'
  | 'cardio';

export type GymEquipmentId =
  | 'barbell'
  | 'dumbbells'
  | 'smith_machine'
  | 'cable_machine'
  | 'leg_press'
  | 'kettlebell'
  | 'treadmill'
  | 'rowing_machine';

export type GymEquipmentItem = {
  id: GymEquipmentId;
  nameZh: string;
  nameEn: string;
  equipmentType: Equipment;
  muscles: EquipmentMuscleGroup[];
  availability:
    | { mode: 'all_of_type' }
    | { mode: 'exercise_ids'; exerciseIds: readonly string[] };
};

export const MUSCLE_GROUP_LABELS: Record<EquipmentMuscleGroup, string> = {
  chest: '胸部',
  back: '背部',
  shoulders: '肩部',
  arms: '手臂',
  core: '核心',
  legs: '腿部',
  glutes: '臀部',
  full_body: '全身',
  cardio: '心肺',
};

export const GYM_EQUIPMENT_CATALOG: readonly GymEquipmentItem[] = [
  {
    id: 'barbell',
    nameZh: '杠铃与深蹲架',
    nameEn: 'Barbell & Rack',
    equipmentType: 'barbell',
    muscles: ['chest', 'back', 'legs'],
    availability: { mode: 'all_of_type' },
  },
  {
    id: 'dumbbells',
    nameZh: '哑铃',
    nameEn: 'Dumbbells',
    equipmentType: 'dumbbell',
    muscles: ['chest', 'shoulders', 'arms'],
    availability: { mode: 'all_of_type' },
  },
  {
    id: 'smith_machine',
    nameZh: '史密斯机',
    nameEn: 'Smith Machine',
    equipmentType: 'machine',
    muscles: ['chest', 'back', 'legs'],
    availability: {
      mode: 'exercise_ids',
      exerciseIds: ['smith_bench_press', 'smith_squat', 'smith_incline_press', 'smith_row'],
    },
  },
  {
    id: 'cable_machine',
    nameZh: '龙门架 / 绳索器械',
    nameEn: 'Cable Machine',
    equipmentType: 'cable',
    muscles: ['chest', 'back', 'shoulders'],
    availability: { mode: 'all_of_type' },
  },
  {
    id: 'leg_press',
    nameZh: '倒蹬机',
    nameEn: 'Leg Press',
    equipmentType: 'machine',
    muscles: ['legs', 'glutes'],
    availability: {
      mode: 'exercise_ids',
      exerciseIds: ['leg_press', 'leg_press_calf_raise'],
    },
  },
  {
    id: 'kettlebell',
    nameZh: '壶铃',
    nameEn: 'Kettlebell',
    equipmentType: 'kettlebell',
    muscles: ['full_body', 'glutes', 'core'],
    availability: { mode: 'all_of_type' },
  },
  {
    id: 'treadmill',
    nameZh: '跑步机',
    nameEn: 'Treadmill',
    equipmentType: 'cardio_machine',
    muscles: ['cardio', 'legs'],
    availability: {
      mode: 'exercise_ids',
      exerciseIds: ['treadmill_run', 'incline_walk'],
    },
  },
  {
    id: 'rowing_machine',
    nameZh: '划船机',
    nameEn: 'Rowing Machine',
    equipmentType: 'cardio_machine',
    muscles: ['cardio', 'back', 'full_body'],
    availability: { mode: 'exercise_ids', exerciseIds: ['rowing_machine'] },
  },
] as const;

export const DEFAULT_GYM_EQUIPMENT_IDS = GYM_EQUIPMENT_CATALOG.map((item) => item.id);
export const DEFAULT_HOME_EQUIPMENT_IDS: GymEquipmentId[] = ['dumbbells', 'kettlebell'];

export function getGymEquipment(id: string): GymEquipmentItem | undefined {
  return GYM_EQUIPMENT_CATALOG.find((item) => item.id === id);
}

export function inferGymEquipmentIds(equipment: readonly string[] | undefined): GymEquipmentId[] {
  if (!equipment?.length) return [];
  const availableTypes = new Set(equipment);
  return GYM_EQUIPMENT_CATALOG.filter((item) => availableTypes.has(item.equipmentType)).map(
    (item) => item.id,
  );
}

export function equipmentTypesForSelection(
  selectedIds: readonly string[],
  location: TrainingLocation,
): Equipment[] {
  if (location === 'bodyweight') return [];
  const types = new Set<Equipment>();
  for (const id of selectedIds) {
    const item = getGymEquipment(id);
    if (item) types.add(item.equipmentType);
  }
  return [...types];
}
