import { create } from 'zustand';

import { getDb } from '@/db/client';
import { getActivePlan, type PlanDetail } from '@/db/repositories/plan-repo';
import { getProfile, saveProfile, type UserProfile } from '@/db/repositories/profile-repo';
import { getSetting, setSetting } from '@/db/repositories/settings-repo';

type AppState = {
  hydrated: boolean;
  onboardingDone: boolean;
  profile: UserProfile | null;
  activePlan: PlanDetail | null;
  hydrate: () => Promise<void>;
  refreshPlan: () => Promise<void>;
  updateProfile: (p: UserProfile) => Promise<void>;
  completeOnboarding: () => Promise<void>;
};

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  onboardingDone: false,
  profile: null,
  activePlan: null,

  hydrate: async () => {
    const db = getDb();
    const [profile, activePlan, onboardingDone] = await Promise.all([
      getProfile(db),
      getActivePlan(db),
      getSetting<boolean>(db, 'onboarding_done'),
    ]);
    set({ profile, activePlan, onboardingDone: !!onboardingDone, hydrated: true });
  },

  refreshPlan: async () => {
    set({ activePlan: await getActivePlan(getDb()) });
  },

  updateProfile: async (p) => {
    await saveProfile(getDb(), p);
    set({ profile: await getProfile(getDb()) });
  },

  completeOnboarding: async () => {
    await setSetting(getDb(), 'onboarding_done', true);
    set({ onboardingDone: true });
    await get().refreshPlan();
  },
}));
