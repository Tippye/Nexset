import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import {
  applyDailyAdjustment,
  generateDailyAdjustment,
  recordAdjustmentDecision,
  type DailyAdjustmentResult,
} from '@/ai/agents/daily-adjustment';
import { isAIConfigured, loadAIConfig } from '@/ai/config';
import type { AIConfig } from '@/ai/types';
import { Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import type { PlanDetail } from '@/db/repositories/plan-repo';
import { getSetting, setSetting } from '@/db/repositories/settings-repo';
import { useTheme } from '@/hooks/use-theme';
import { getCurrentDeviationReport, type DeviationReport } from '@/lib/deviation';
import type { PlanChange } from '@/lib/plan-diff';

import { ThemedText } from './themed-text';
import { Button, Card, Input, Row, SectionTitle } from './ui-kit';

const IGNORE_KEY = 'daily_adjust_ignored_until';

export function DailyAdjustmentCard({
  plan,
  onApplied,
}: {
  plan: PlanDetail;
  onApplied: () => Promise<void>;
}) {
  const theme = useTheme();
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [report, setReport] = useState<DeviationReport | null>(null);
  const [result, setResult] = useState<DailyAdjustmentResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [generatedNoChange, setGeneratedNoChange] = useState(false);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      loadAIConfig(),
      getCurrentDeviationReport(getDb(), plan, 7),
      getSetting<number>(getDb(), IGNORE_KEY),
    ]).then(([nextConfig, nextReport, ignoredUntil]) => {
      if (!alive) return;
      setConfig(nextConfig);
      setReport(nextReport);
      if ((ignoredUntil ?? 0) > Date.now()) setDismissed(true);
    });
    return () => {
      alive = false;
    };
  }, [plan]);

  async function generate() {
    setBusy(true);
    setGeneratedNoChange(false);
    try {
      const next = await generateDailyAdjustment(plan, config, {
        subjectiveFeedback: feedback,
      });
      setResult(next);
      setReport(next.report);
      const changes = next.proposal?.adjustment?.changes ?? [];
      setSelected(new Set(changes.map((_, index) => index)));
      if (!next.proposal && !next.fallbackReason) setGeneratedNoChange(true);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    const adjustment = result?.proposal?.adjustment;
    if (!adjustment) return;
    const changes = adjustment.changes.filter((_, index) => selected.has(index));
    if (!changes.length) {
      Alert.alert('至少选择一项调整');
      return;
    }
    setBusy(true);
    try {
      const warnings = await applyDailyAdjustment(plan, changes, adjustment.reason_summary);
      await recordAdjustmentDecision(
        result?.logId,
        changes.length === adjustment.changes.length ? 'accept' : 'partial',
      );
      await onApplied();
      setDismissed(true);
      Alert.alert(
        '调整已应用',
        warnings.length ? `安全钳制：${warnings.join('；')}` : '计划已更新，并保存了可回滚的 revision。',
      );
    } catch (error) {
      Alert.alert('无法应用调整', error instanceof Error ? error.message : '调整校验失败');
    } finally {
      setBusy(false);
    }
  }

  async function ignore() {
    await recordAdjustmentDecision(result?.logId, 'reject');
    await setSetting(getDb(), IGNORE_KEY, Date.now() + 48 * 60 * 60 * 1000);
    setDismissed(true);
  }

  if (!report || dismissed || !report.shouldTriggerAgent) return null;
  const adjustment = result?.proposal?.adjustment;

  return (
    <>
      <SectionTitle>训练偏差</SectionTitle>
      <Card style={{ borderWidth: 1, borderColor: theme.warning }}>
        <ThemedText type="smallBold">近 {report.days} 天完成率 {Math.round(report.completionRate * 100)}%</ThemedText>
        {report.reasons.map((reason) => (
          <ThemedText key={reason} type="small" themeColor="textSecondary">
            · {reason}
          </ThemedText>
        ))}
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          这是本地数据报告，尚未对计划做任何修改。
        </ThemedText>
        {!adjustment ? (
          <>
            <Input
              value={feedback}
              onChangeText={setFeedback}
              placeholder="可选：补充睡眠、疲劳、疼痛或时间安排"
              style={styles.feedback}
            />
            {result?.fallbackReason ? (
              <ThemedText type="small" style={{ color: theme.warning, marginBottom: Spacing.two }}>
                {result.fallbackReason}
              </ThemedText>
            ) : null}
            {generatedNoChange ? (
              <ThemedText type="small" style={{ color: theme.success, marginBottom: Spacing.two }}>
                Nex 判断当前不需要调整，继续按原计划训练即可。
              </ThemedText>
            ) : null}
            {isAIConfigured(config) ? (
              <Button onPress={generate} loading={busy}>
                获取最小调整建议
              </Button>
            ) : (
              <Button variant="secondary" onPress={() => router.push('/settings/ai')}>
                配置 AI 获取调整建议
              </Button>
            )}
          </>
        ) : null}
      </Card>

      {adjustment ? (
        <Card style={{ borderWidth: 1, borderColor: theme.accent }}>
          <ThemedText type="smallBold">Nex 的调整建议</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            {result?.proposal?.message || adjustment.reason_summary}
          </ThemedText>
          {adjustment.changes.map((change, index) => (
            <Pressable
              key={`${change.op}-${change.target}-${index}`}
              onPress={() =>
                setSelected((current) => {
                  const next = new Set(current);
                  if (next.has(index)) next.delete(index);
                  else next.add(index);
                  return next;
                })
              }
              style={[styles.change, { borderColor: selected.has(index) ? theme.accent : theme.border }]}>
              <Row>
                <View
                  style={[
                    styles.check,
                    { backgroundColor: selected.has(index) ? theme.accent : 'transparent', borderColor: theme.accent },
                  ]}
                />
                <View style={styles.flex}>
                  <ThemedText type="smallBold">{changeLabel(change)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {change.rationale}
                  </ThemedText>
                </View>
              </Row>
            </Pressable>
          ))}
          {result?.warnings.map((warning) => (
            <ThemedText key={warning} type="small" style={{ color: theme.warning }}>
              安全钳制：{warning}
            </ThemedText>
          ))}
          <Button onPress={apply} loading={busy}>
            应用选中的 {selected.size} 项
          </Button>
          <View style={styles.buttonGap} />
          <Button variant="ghost" onPress={ignore} disabled={busy}>
            忽略，48 小时内不再提醒
          </Button>
        </Card>
      ) : (
        <Button variant="ghost" compact onPress={ignore}>
          暂时忽略偏差提醒
        </Button>
      )}
    </>
  );
}

function changeLabel(change: PlanChange): string {
  switch (change.op) {
    case 'modify_weight':
      return `重量 ${change.from_kg ?? '当前'}kg → ${change.to_kg ?? '建议'}kg`;
    case 'modify_reps':
      return `次数 ${change.from_reps ?? '当前'} → ${change.to_reps ?? '建议'}`;
    case 'add_set':
      return `增加 ${Math.abs(change.sets_delta ?? 1)} 组`;
    case 'remove_set':
      return `减少 ${Math.abs(change.sets_delta ?? 1)} 组`;
    case 'replace_exercise':
      return `替换动作 → ${change.to_exercise_id}`;
    case 'move_day':
      return `训练日调整到周${change.to_day_of_week}`;
    case 'skip_day':
      return '本周跳过该训练日';
    case 'deload_week':
      return `安排减载周（重量 -${change.weight_reduction_pct ?? 35}%）`;
    case 'update_nutrition':
      return `营养调整到 ${change.daily_kcal} kcal`;
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hint: { marginTop: Spacing.one, marginBottom: Spacing.two },
  feedback: { marginBottom: Spacing.two },
  change: { borderWidth: 1, borderRadius: 12, padding: Spacing.two, marginBottom: Spacing.two },
  check: { width: 18, height: 18, borderRadius: 5, borderWidth: 1 },
  buttonGap: { height: Spacing.one },
});
