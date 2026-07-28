import { eq } from 'drizzle-orm';

import type { GymEquipmentId, TrainingLocation } from '@/data/gym-equipment';

import { logOp } from '../oplog';
import { userProfile } from '../schema';
import type { DB } from '../types';

export type UserProfile = {
  sex?: 'male' | 'female' | 'other';
  birthYear?: number;
  heightCm?: number;
  weightKg?: number;
  experience?: 'novice' | 'intermediate' | 'advanced';
  goal?: 'hypertrophy' | 'fat_loss' | 'strength' | 'endurance' | 'toning';
  daysPerWeek?: number;
  sessionMinutes?: number;
  equipment?: string[];
  trainingLocation?: TrainingLocation;
  gymEquipmentIds?: GymEquipmentId[];
  injuries?: string[];
  cardioPref?: string;
  incomplete?: boolean;
};

const PROFILE_ID = 'me';

export async function getProfile(db: DB): Promise<UserProfile | null> {
  const rows = await db.select().from(userProfile).where(eq(userProfile.id, PROFILE_ID)).limit(1);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    sex: (r.sex as UserProfile['sex']) ?? undefined,
    birthYear: r.birthYear ?? undefined,
    heightCm: r.heightCm ?? undefined,
    weightKg: r.weightKg ?? undefined,
    experience: (r.experience as UserProfile['experience']) ?? undefined,
    goal: (r.goal as UserProfile['goal']) ?? undefined,
    daysPerWeek: r.daysPerWeek ?? undefined,
    sessionMinutes: r.sessionMinutes ?? undefined,
    equipment: parseStringArray(r.equipmentJson),
    trainingLocation: (r.trainingLocation as TrainingLocation | null) ?? undefined,
    gymEquipmentIds: parseStringArray(r.gymEquipmentJson) as GymEquipmentId[] | undefined,
    injuries: parseStringArray(r.injuriesJson),
    cardioPref: r.cardioPref ?? undefined,
    incomplete: r.incomplete,
  };
}

export async function saveProfile(db: DB, profile: UserProfile): Promise<void> {
  const now = Date.now();
  const row = {
    id: PROFILE_ID,
    sex: profile.sex ?? null,
    birthYear: profile.birthYear ?? null,
    heightCm: profile.heightCm ?? null,
    weightKg: profile.weightKg ?? null,
    experience: profile.experience ?? null,
    goal: profile.goal ?? null,
    daysPerWeek: profile.daysPerWeek ?? null,
    sessionMinutes: profile.sessionMinutes ?? null,
    equipmentJson: profile.equipment ? JSON.stringify(profile.equipment) : null,
    trainingLocation: profile.trainingLocation ?? null,
    gymEquipmentJson:
      profile.gymEquipmentIds !== undefined ? JSON.stringify(profile.gymEquipmentIds) : null,
    injuriesJson: profile.injuries ? JSON.stringify(profile.injuries) : null,
    cardioPref: profile.cardioPref ?? null,
    incomplete: profile.incomplete ?? false,
    updatedAt: now,
  };
  await db
    .insert(userProfile)
    .values({ ...row, createdAt: now })
    .onConflictDoUpdate({ target: userProfile.id, set: row });
  await logOp(db, 'user_profile', PROFILE_ID, 'put', { ...row, createdAt: now });
}

function parseStringArray(value: string | null): string[] | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}
