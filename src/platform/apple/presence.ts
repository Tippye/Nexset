import { Platform } from 'react-native';

import {
  NexsetWorkoutActivity,
  type WorkoutActivityProps,
} from '../../../widgets/NexsetWorkoutActivity';
import {
  NexsetWorkoutWidget,
  type WorkoutWidgetProps,
} from '../../../widgets/NexsetWorkoutWidget';

export type WorkoutPresenceSnapshot = WorkoutActivityProps;

function activityDestination(sessionId: string): string {
  return `nexset://workout/${encodeURIComponent(sessionId)}`;
}

export async function publishIdleWidget(title = '开始训练', subtitle = '打开 Nexset 记录今天的训练') {
  if (Platform.OS !== 'ios') return;
  const props: WorkoutWidgetProps = {
    active: false,
    title,
    subtitle,
    progress: '准备就绪',
    destination: 'nexset://start-workout',
  };
  NexsetWorkoutWidget.updateSnapshot(props);
}

export async function publishWorkoutPresence(snapshot: WorkoutPresenceSnapshot) {
  if (Platform.OS !== 'ios') return;
  const destination = activityDestination(snapshot.sessionId);
  NexsetWorkoutWidget.updateSnapshot({
    active: true,
    title: snapshot.exerciseName || snapshot.label,
    subtitle: snapshot.status === 'resting' ? '组间休息中' : snapshot.label,
    progress: `${snapshot.completedSets}/${Math.max(snapshot.totalSets, snapshot.completedSets)} 组`,
    destination,
  });

  const instances = NexsetWorkoutActivity.getInstances();
  if (instances.length === 0) {
    NexsetWorkoutActivity.start(snapshot, destination);
  } else {
    await Promise.all(instances.map((instance) => instance.update(snapshot)));
  }
}

export async function endWorkoutPresence(snapshot: WorkoutPresenceSnapshot) {
  if (Platform.OS !== 'ios') return;
  const finalSnapshot: WorkoutPresenceSnapshot = {
    ...snapshot,
    restEndsAt: null,
    status: 'finished',
  };
  await Promise.all(
    NexsetWorkoutActivity.getInstances().map((instance) =>
      instance.end('immediate', finalSnapshot),
    ),
  );
  await publishIdleWidget();
}
