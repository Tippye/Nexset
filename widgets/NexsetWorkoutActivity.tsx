import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  font,
  foregroundStyle,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

export type WorkoutActivityProps = {
  sessionId: string;
  label: string;
  exerciseName: string;
  completedSets: number;
  totalSets: number;
  currentSet: number;
  targetSets: number;
  restEndsAt: number | null;
  startedAt: number;
  status: 'training' | 'resting' | 'finished';
};

function progressText(props: WorkoutActivityProps): string {
  return `${props.completedSets}/${Math.max(props.totalSets, props.completedSets)} 组`;
}

function stateText(props: WorkoutActivityProps): string {
  if (props.status === 'finished') return '训练完成';
  if (props.status === 'resting') return '组间休息';
  return `第 ${props.currentSet}/${Math.max(props.targetSets, props.currentSet)} 组`;
}

function WorkoutActivity(props: WorkoutActivityProps) {
  'widget';

  const accent = props.status === 'resting' ? '#62D9FF' : '#D4FF34';
  const restEnd = props.restEndsAt ? new Date(props.restEndsAt) : null;

  const banner = (
    <VStack
      alignment="leading"
      spacing={8}
      modifiers={[padding({ all: 16 }), activityBackgroundTint('#111318')]}>
      <HStack spacing={8}>
        <Image systemName="figure.strengthtraining.traditional" size={20} color={accent} />
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(accent)]}>NEXSET · {stateText(props)}</Text>
        <Spacer />
        <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle('#A1A1AA')]}>{progressText(props)}</Text>
      </HStack>
      <Text modifiers={[font({ size: 21, weight: 'bold', design: 'rounded' }), foregroundStyle('#FFFFFF')]}>{props.exerciseName || props.label}</Text>
      <HStack>
        <Text modifiers={[font({ size: 12 }), foregroundStyle('#A1A1AA')]}>{props.label}</Text>
        <Spacer />
        {restEnd ? (
          <Text date={restEnd} dateStyle="timer" modifiers={[font({ size: 15, weight: 'bold', design: 'monospaced' }), foregroundStyle(accent)]} />
        ) : null}
      </HStack>
    </VStack>
  );

  return {
    banner,
    compactLeading: <Image systemName="figure.strengthtraining.traditional" size={16} color={accent} />,
    compactTrailing: restEnd ? (
      <Text date={restEnd} dateStyle="timer" modifiers={[font({ size: 12, weight: 'bold', design: 'monospaced' }), foregroundStyle(accent)]} />
    ) : (
      <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(accent)]}>{progressText(props)}</Text>
    ),
    minimal: <Image systemName={props.status === 'resting' ? 'timer' : 'figure.strengthtraining.traditional'} size={15} color={accent} />,
    expandedLeading: <Image systemName="figure.strengthtraining.traditional" size={20} color={accent} />,
    expandedCenter: <Text modifiers={[font({ size: 14, weight: 'bold' }), foregroundStyle('#FFFFFF')]}>{props.exerciseName}</Text>,
    expandedTrailing: restEnd ? (
      <Text date={restEnd} dateStyle="timer" modifiers={[font({ size: 13, weight: 'bold', design: 'monospaced' }), foregroundStyle(accent)]} />
    ) : (
      <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(accent)]}>{progressText(props)}</Text>
    ),
    expandedBottom: <Text modifiers={[font({ size: 12 }), foregroundStyle('#A1A1AA')]}>{props.label} · {stateText(props)}</Text>,
  };
}

export const NexsetWorkoutActivity = createLiveActivity<WorkoutActivityProps>(
  'NexsetWorkoutActivity',
  WorkoutActivity,
);

export default NexsetWorkoutActivity;
