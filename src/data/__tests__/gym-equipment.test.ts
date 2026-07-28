import { describe, expect, it } from '@jest/globals';

import {
  DEFAULT_GYM_EQUIPMENT_IDS,
  GYM_EQUIPMENT_CATALOG,
  equipmentTypesForSelection,
  inferGymEquipmentIds,
} from '../gym-equipment';

describe('gym equipment catalog', () => {
  it('has stable unique ids and muscle categories for every item', () => {
    const ids = GYM_EQUIPMENT_CATALOG.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DEFAULT_GYM_EQUIPMENT_IDS).toEqual(ids);
    expect(GYM_EQUIPMENT_CATALOG.every((item) => item.muscles.length > 0)).toBe(true);
  });

  it('maps detailed selections to the existing plan equipment types', () => {
    expect(
      equipmentTypesForSelection(['smith_machine', 'leg_press', 'treadmill'], 'gym'),
    ).toEqual(['machine', 'cardio_machine']);
    expect(equipmentTypesForSelection(['dumbbells'], 'bodyweight')).toEqual([]);
  });

  it('infers detailed choices for legacy category-only profiles', () => {
    expect(inferGymEquipmentIds(['barbell', 'cardio_machine'])).toEqual([
      'barbell',
      'treadmill',
      'rowing_machine',
    ]);
  });
});
