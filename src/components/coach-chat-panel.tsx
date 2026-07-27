import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import {
  addChatMessage,
  createChatSession,
  getChatMessages,
  getLatestChatSession,
} from '@/db/repositories/chat-repo';
import { listExercises, type Exercise } from '@/db/repositories/exercise-repo';
import {
  addSetLog,
  endSession,
  getRecentSessions,
  getSessionSets,
  startSession,
} from '@/db/repositories/workout-repo';
import { useTheme } from '@/hooks/use-theme';
import { classifyCoachIntent, extractLogSlots, safetyReply } from '@/lib/coach-intent';

import { ThemedText } from './themed-text';
import { Button, Card, Input, Row, SectionTitle } from './ui-kit';

type ChatRow = Awaited<ReturnType<typeof getChatMessages>>[number];
type PendingLog = { exercise: Exercise; weightKg?: number; reps: number; sets: number };

export function CoachChatPanel({ onPlanRequest }: { onPlanRequest: (request: string) => void }) {
  const theme = useTheme();
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [input, setInput] = useState('');
  const [pendingLog, setPendingLog] = useState<PendingLog | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const db = getDb();
      const id = (await getLatestChatSession(db)) ?? (await createChatSession(db, 'Nex 教练'));
      setSessionId(id);
      setMessages(await getChatMessages(db, id, 40));
    })();
  }, []);

  async function reply(content: string, card?: unknown) {
    await addChatMessage(getDb(), sessionId, 'assistant', content, card);
    setMessages(await getChatMessages(getDb(), sessionId, 40));
  }

  async function send() {
    const text = input.trim();
    if (!text || !sessionId || busy) return;
    setBusy(true);
    setInput('');
    setPendingLog(null);
    try {
      await addChatMessage(getDb(), sessionId, 'user', text);
      const intent = classifyCoachIntent(text);
      if (intent === 'safety_boundary') {
        await reply(safetyReply(text));
      } else if (intent === 'plan_generation') {
        onPlanRequest(text);
        await reply('我已把你的诉求填入上方计划生成器。请检查档案和诉求后点击生成，草案确认前不会替换当前计划。');
      } else if (intent === 'daily_adjust') {
        await reply('我理解你想调整现有安排。请到「今日」查看本地偏差报告；有实质偏差时可生成最小调整卡片。');
      } else if (intent === 'stats_query') {
        await reply(await statsReply());
      } else if (intent === 'log_entry') {
        await handleLogIntent(text);
      } else if (intent === 'exercise_question') {
        await reply(await exerciseReply(text));
      } else {
        await reply('我可以帮你生成或调整计划、查询训练数据、记录一组训练，也可以解释动作要点。你想先做哪一项？');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleLogIntent(text: string) {
    const slots = extractLogSlots(text);
    const exercises = await listExercises(getDb());
    const query = slots.exerciseQuery?.toLowerCase() ?? '';
    const exercise = slots.exerciseQuery
      ? resolveExercise(exercises, slots.exerciseQuery, query)
      : null;
    if (!exercise || !slots.reps) {
      await reply('我还需要动作名称和次数，例如：“帮我记一组深蹲 60 公斤 8 次”。');
      return;
    }
    const pending = {
      exercise,
      weightKg: slots.weightKg,
      reps: slots.reps,
      sets: slots.sets ?? 1,
    };
    setPendingLog(pending);
    await reply(
      `请确认：${exercise.nameZh} ${pending.sets}组 × ${pending.reps}次${pending.weightKg != null ? ` @ ${pending.weightKg}kg` : ''}。`,
      { type: 'log_confirm', payload: pending },
    );
  }

  async function confirmLog() {
    if (!pendingLog) return;
    setBusy(true);
    try {
      const workoutId = await startSession(getDb());
      for (let index = 0; index < pendingLog.sets; index++) {
        await addSetLog(getDb(), workoutId, {
          exerciseId: pendingLog.exercise.id,
          setNo: index + 1,
          weightKg: pendingLog.weightKg,
          reps: pendingLog.reps,
          source: 'chat',
        });
      }
      await endSession(getDb(), workoutId, { note: '由 Nex 对话确认记录' });
      await reply('已按你的确认写入训练记录。');
      setPendingLog(null);
    } catch (error) {
      Alert.alert('记录失败', error instanceof Error ? error.message : '暂时无法写入');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <SectionTitle>对话教练</SectionTitle>
      <Card>
        {messages.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            试试说：“我最近练得怎么样？”或“帮我记一组深蹲 60 公斤 8 次”。
          </ThemedText>
        ) : (
          messages.slice(-12).map((message) => (
            <View
              key={message.id}
              style={[
                styles.bubble,
                {
                  alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                  backgroundColor:
                    message.role === 'user' ? theme.accentSoft : theme.backgroundSelected,
                },
              ]}>
              <ThemedText type="small">{message.content}</ThemedText>
            </View>
          ))
        )}
        {pendingLog ? (
          <View style={[styles.confirm, { borderColor: theme.accent }]}>
            <ThemedText type="smallBold">记录确认卡</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {pendingLog.exercise.nameZh} · {pendingLog.sets}组 × {pendingLog.reps}次
              {pendingLog.weightKg != null ? ` @ ${pendingLog.weightKg}kg` : ''}
            </ThemedText>
            <Row style={styles.actions}>
              <Button compact onPress={confirmLog} loading={busy}>✓ 确认记录</Button>
              <Button compact variant="ghost" onPress={() => setPendingLog(null)}>取消</Button>
            </Row>
          </View>
        ) : null}
        <Input
          value={input}
          onChangeText={setInput}
          placeholder="问动作、查数据、记训练或调整计划…"
          multiline
          style={styles.input}
        />
        <Button onPress={send} loading={busy}>发送</Button>
        <Button variant="ghost" compact onPress={() => router.push('/logbook')}>
          查看训练记录
        </Button>
      </Card>
    </View>
  );
}

async function statsReply(): Promise<string> {
  const sessions = (await getRecentSessions(getDb(), 20)).filter((session) => session.endedAt != null);
  let sets = 0;
  let volume = 0;
  for (const session of sessions) {
    for (const item of await getSessionSets(getDb(), session.id)) {
      if (item.status !== 'confirmed' || item.isWarmup) continue;
      sets += 1;
      volume += (item.weightKg ?? 0) * (item.reps ?? 0);
    }
  }
  return sessions.length
    ? `最近 ${sessions.length} 次已完成训练共记录 ${sets} 个工作组，训练量约 ${Math.round(volume)}kg。数据来自本地记录；可到「统计」查看趋势。`
    : '本地还没有已完成训练记录，先完成一次训练后我才能给出数据结论。';
}

async function exerciseReply(text: string): Promise<string> {
  const exercises = await listExercises(getDb());
  const exercise = exercises.find(
    (item) => text.includes(item.nameZh) || text.toLowerCase().includes(item.nameEn.toLowerCase()),
  );
  if (!exercise) return '请告诉我具体动作名称，我会从本地动作库读取要点，不会凭空编造。';
  return `${exercise.nameZh}：${exercise.cues.slice(0, 3).join('；') || '保持动作稳定、使用可控重量'}。如动作引发疼痛请停止，并选择无痛替代动作。`;
}

function resolveExercise(exercises: Exercise[], original: string, query: string): Exercise | null {
  const aliases: Record<string, string> = {
    深蹲: 'back_squat',
    卧推: 'barbell_bench_press',
    硬拉: 'deadlift',
    划船: 'barbell_row',
    引体: 'pull_up',
    推举: 'overhead_press',
  };
  const exact = exercises.find(
    (item) => item.nameZh === original || item.nameEn.toLowerCase() === query || item.id === query,
  );
  if (exact) return exact;
  const aliasId = aliases[original];
  if (aliasId) return exercises.find((item) => item.id === aliasId) ?? null;
  return (
    exercises.find(
      (item) =>
        item.nameZh.includes(original) ||
        item.nameEn.toLowerCase().includes(query) ||
        item.id.includes(query),
    ) ?? null
  );
}

const styles = StyleSheet.create({
  root: { marginTop: Spacing.two },
  bubble: { maxWidth: '88%', borderRadius: 12, padding: Spacing.two, marginBottom: Spacing.two },
  confirm: { borderWidth: 1, borderRadius: 12, padding: Spacing.two, marginBottom: Spacing.two },
  actions: { marginTop: Spacing.two, justifyContent: 'space-between' },
  input: { minHeight: 72, textAlignVertical: 'top', marginTop: Spacing.two, marginBottom: Spacing.two },
});
