import { HStack, Image, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

export type WorkoutWidgetProps = {
  active: boolean;
  title: string;
  subtitle: string;
  progress: string;
  destination: string;
};

const INITIAL_PROPS: WorkoutWidgetProps = {
  active: false,
  title: '开始训练',
  subtitle: '打开 Nexset 记录今天的训练',
  progress: '准备就绪',
  destination: 'nexset://start-workout',
};

function WorkoutWidget(props: WorkoutWidgetProps = INITIAL_PROPS) {
  'widget';

  return (
    <VStack
      alignment="leading"
      spacing={8}
      modifiers={[
        padding({ all: 14 }),
        containerBackground('#111318', 'widget'),
        widgetURL(props.destination),
      ]}>
      <HStack spacing={7}>
        <Image systemName={props.active ? 'figure.strengthtraining.traditional' : 'bolt.heart.fill'} size={18} color="#D4FF34" />
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle('#D4FF34')]}>NEXSET</Text>
        <Spacer />
        <Text modifiers={[font({ size: 11, weight: 'medium' }), foregroundStyle('#A1A1AA')]}>{props.progress}</Text>
      </HStack>
      <Spacer />
      <Text modifiers={[font({ size: 19, weight: 'bold', design: 'rounded' }), foregroundStyle('#FFFFFF')]}>{props.title}</Text>
      <Text modifiers={[font({ size: 12 }), foregroundStyle('#A1A1AA')]}>{props.subtitle}</Text>
      <Link
        destination={props.destination}
        label={props.active ? '返回训练' : '开始训练'}
        modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle('#D4FF34')]}
      />
    </VStack>
  );
}

export const NexsetWorkoutWidget = createWidget<WorkoutWidgetProps>(
  'NexsetWorkoutWidget',
  WorkoutWidget,
);

export default NexsetWorkoutWidget;
