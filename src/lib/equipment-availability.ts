import { getGymEquipment } from '@/data/gym-equipment';
import type { Exercise } from '@/db/repositories/exercise-repo';
import type { UserProfile } from '@/db/repositories/profile-repo';

/**
 * Exact equipment availability for plan generation. Legacy profiles without
 * detailed equipment ids keep the original category-level behavior.
 */
export function isExerciseSupportedByProfile(
  profile: UserProfile,
  exercise: Exercise,
): boolean {
  if (exercise.equipment === 'bodyweight' || exercise.equipment === 'other') return true;

  if (profile.trainingLocation === 'bodyweight') return false;

  if (profile.gymEquipmentIds !== undefined) {
    return profile.gymEquipmentIds.some((id) => {
      const item = getGymEquipment(id);
      if (!item || item.equipmentType !== exercise.equipment) return false;
      return (
        item.availability.mode === 'all_of_type' ||
        item.availability.exerciseIds.includes(exercise.id)
      );
    });
  }

  const configured = profile.equipment ?? [];
  return configured.includes(exercise.equipment);
}
