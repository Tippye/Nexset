import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Input, Row } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function PlanClarificationCard({
  question,
  answer,
  onAnswerChange,
  onSubmit,
  busy,
}: {
  question: string;
  answer: string;
  onAnswerChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  const theme = useTheme();

  return (
    <Card style={[styles.card, { borderColor: theme.chart4 }]}>
      <Row style={styles.titleRow}>
        <View style={[styles.icon, { backgroundColor: `${theme.chart4}18` }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.chart4} />
        </View>
        <View style={styles.flex}>
          <ThemedText type="smallBold">AI 还需要一项信息</ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            回答后会连同此前信息继续生成
          </ThemedText>
        </View>
      </Row>

      <ScrollView
        style={[styles.questionScroll, { backgroundColor: theme.backgroundElement }]}
        contentContainerStyle={styles.questionContent}
        nestedScrollEnabled
        showsVerticalScrollIndicator>
        <ThemedText type="small" style={styles.question}>
          {question}
        </ThemedText>
      </ScrollView>

      <Input
        value={answer}
        onChangeText={onAnswerChange}
        placeholder="输入你的回答"
        multiline
        maxLength={1200}
        editable={!busy}
        style={styles.answer}
      />
      <Button
        compact
        onPress={onSubmit}
        disabled={!answer.trim()}
        loading={busy}
        style={styles.submit}>
        提交回答并继续
      </Button>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    marginTop: Spacing.three,
  },
  titleRow: {
    alignItems: 'flex-start',
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  questionScroll: {
    maxHeight: 60,
    borderRadius: 10,
    marginTop: Spacing.two,
  },
  questionContent: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 8,
  },
  question: {
    lineHeight: 20,
  },
  answer: {
    minHeight: 72,
    marginTop: Spacing.two,
    textAlignVertical: 'top',
  },
  submit: {
    alignSelf: 'flex-end',
    marginTop: Spacing.two,
  },
});
