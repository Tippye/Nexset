import type { EventSubscription } from 'expo-modules-core';

declare module 'expo-modules-core' {
  /** Compatibility alias for @plevo/expo-watch-connectivity 0.1.x on Expo 57. */
  export type Subscription = EventSubscription;
}
