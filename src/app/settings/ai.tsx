import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import {
  defaultAIConfig,
  loadAIConfig,
  saveAIConfig,
  WEB_KEY_WARNING,
} from '@/ai/config';
import { testAIConnection } from '@/ai/provider';
import type { AIConfig, AIProtocol } from '@/ai/types';
import { ScreenContainer } from '@/components/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, ChipRow, Input, Row, SectionTitle } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import {
  getIntelligenceMetrics,
  type IntelligenceMetric,
} from '@/db/repositories/intelligence-metrics-repo';
import { useTheme } from '@/hooks/use-theme';
import {
  defaultLocalModelConfig,
  isLocalModelConfigured,
  loadLocalModelConfig,
  saveLocalModelConfig,
  type LocalModelConfig,
  type LocalModelId,
  type LocalModelQuantization,
} from '@/intelligence/local-model-config';

export default function AISettingsScreen() {
  const theme = useTheme();
  const [config, setConfig] = useState<AIConfig>(defaultAIConfig());
  const [localConfig, setLocalConfig] = useState<LocalModelConfig>(defaultLocalModelConfig());
  const [metrics, setMetrics] = useState<IntelligenceMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([loadAIConfig(), loadLocalModelConfig(), getIntelligenceMetrics(getDb())])
      .then(([stored, local, nextMetrics]) => {
        if (stored) setConfig(stored);
        setLocalConfig(local);
        setMetrics(nextMetrics);
      })
      .finally(() => setLoading(false));
  }, []);

  function selectProtocol(protocol: AIProtocol) {
    if (protocol === config.protocol) return;
    const defaults = defaultAIConfig(protocol);
    setConfig({
      ...defaults,
      apiKey: config.apiKey,
    });
    setLatency(null);
  }

  async function save() {
    if (!validConfig(config) && !isLocalModelConfigured(localConfig)) {
      Alert.alert('配置不完整', '请至少配置一个有效的端侧 GGUF 模型或云端 API 模型。');
      return;
    }
    setSaving(true);
    try {
      await Promise.all([saveAIConfig(config), saveLocalModelConfig(localConfig)]);
      Alert.alert(
        '已保存',
        validConfig(config) && isLocalModelConfigured(localConfig)
          ? '已启用端侧优先、云端降级的大小模型协同。'
          : '当前为单模型模式，所有 AI 任务统一使用已配置的模型。',
      );
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    if (!validConfig(config)) {
      Alert.alert('配置不完整', '请先填写 HTTPS Base URL、API Key 和模型名。');
      return;
    }
    setTesting(true);
    setLatency(null);
    try {
      const result = await testAIConnection(config);
      const next = { ...config, supportsTools: result.supportsTools };
      setConfig(next);
      setLatency(result.latencyMs);
      await saveAIConfig(next);
      Alert.alert(
        '连接成功',
        result.supportsTools
          ? `模型支持工具调用（${result.latencyMs}ms）。`
          : `模型可用，但不支持工具调用；将使用 JSON 文本兼容模式（${result.latencyMs}ms）。`,
      );
    } catch (error) {
      Alert.alert('连接失败', error instanceof Error ? error.message : '无法连接 AI 服务');
    } finally {
      setTesting(false);
    }
  }

  return (
    <ScreenContainer>
      <Row style={styles.header}>
        <Pressable accessibilityLabel="返回" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
        <View>
          <ThemedText type="subtitle">AI 设置</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            使用你自己的模型服务
          </ThemedText>
        </View>
      </Row>

      <SectionTitle>API 协议</SectionTitle>
      <ChipRow>
        <Chip
          label="OpenAI 兼容"
          selected={config.protocol === 'openai'}
          onPress={() => selectProtocol('openai')}
        />
        <Chip
          label="Anthropic"
          selected={config.protocol === 'anthropic'}
          onPress={() => selectProtocol('anthropic')}
        />
      </ChipRow>

      <SectionTitle>Base URL</SectionTitle>
      <Input
        value={config.baseUrl}
        onChangeText={(baseUrl) =>
          setConfig((current) => ({ ...current, baseUrl, supportsTools: null }))
        }
        placeholder={
          config.protocol === 'openai'
            ? 'https://api.openai.com/v1'
            : 'https://api.anthropic.com/v1'
        }
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
        {config.protocol === 'openai'
          ? '会自动追加 /chat/completions；若地址已包含该路径则不会重复。'
          : '会自动追加 /messages；需为原生 Anthropic Messages API。'}
      </ThemedText>

      <SectionTitle>模型名</SectionTitle>
      <Input
        value={config.model}
        onChangeText={(model) =>
          setConfig((current) => ({ ...current, model, supportsTools: null }))
        }
        placeholder="填写服务商提供的模型 ID"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <SectionTitle>API Key</SectionTitle>
      <Input
        value={config.apiKey}
        onChangeText={(apiKey) => setConfig((current) => ({ ...current, apiKey }))}
        placeholder="仅保存在本机"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      {Platform.OS === 'web' ? (
        <ThemedText type="small" style={[styles.hint, { color: theme.warning }]}>
          {WEB_KEY_WARNING}
        </ThemedText>
      ) : (
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Key 使用系统安全存储，不进入 SQLite、导出文件或 WebDAV。
        </ThemedText>
      )}

      <SectionTitle>云端估算价格（美元 / 百万 Token）</SectionTitle>
      <Row style={styles.priceRow}>
        <View style={styles.flex}>
          <Input
            value={String(config.inputCostPerMillion ?? 0)}
            onChangeText={(value) =>
              setConfig((current) => ({ ...current, inputCostPerMillion: numeric(value) }))
            }
            placeholder="输入价格"
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.flex}>
          <Input
            value={String(config.outputCostPerMillion ?? 0)}
            onChangeText={(value) =>
              setConfig((current) => ({ ...current, outputCostPerMillion: numeric(value) }))
            }
            placeholder="输出价格"
            keyboardType="decimal-pad"
          />
        </View>
      </Row>

      <SectionTitle>端侧 GGUF 模型</SectionTitle>
      <ChipRow>
        <Chip
          label="启用"
          selected={localConfig.enabled}
          onPress={() => setLocalConfig((current) => ({ ...current, enabled: true }))}
        />
        <Chip
          label="停用"
          selected={!localConfig.enabled}
          onPress={() => setLocalConfig((current) => ({ ...current, enabled: false }))}
        />
      </ChipRow>
      <ChipRow>
        {(['minicpm5-1b', 'qwen3.5-4b'] as LocalModelId[]).map((modelId) => (
          <Chip
            key={modelId}
            label={modelId === 'minicpm5-1b' ? 'MiniCPM5-1B' : 'Qwen3.5-4B'}
            selected={localConfig.modelId === modelId}
            onPress={() => setLocalConfig((current) => ({ ...current, modelId }))}
          />
        ))}
      </ChipRow>
      <ChipRow>
        {(['Q4_K_M', 'Q5_K_M', 'custom'] as LocalModelQuantization[]).map((quantization) => (
          <Chip
            key={quantization}
            label={quantization === 'custom' ? '自定义量化' : quantization}
            selected={localConfig.quantization === quantization}
            onPress={() => setLocalConfig((current) => ({ ...current, quantization }))}
          />
        ))}
      </ChipRow>
      <Input
        value={localConfig.modelPath}
        onChangeText={(modelPath) => setLocalConfig((current) => ({ ...current, modelPath }))}
        placeholder="file:///…/model.gguf"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
        MiniCPM5-1B Q4_K_M 适合多数手机；Qwen3.5-4B 需要更高内存。模型文件只保存在设备，不参与 WebDAV 同步。
      </ThemedText>

      <SectionTitle>能力状态</SectionTitle>
      <Card>
        <Row style={styles.statusRow}>
          <Ionicons
            name={
              config.supportsTools == null
                ? 'ellipse-outline'
                : config.supportsTools
                  ? 'checkmark-circle'
                  : 'information-circle'
            }
            size={22}
            color={
              config.supportsTools == null
                ? theme.textSecondary
                : config.supportsTools
                  ? theme.success
                  : theme.warning
            }
          />
          <View style={styles.flex}>
            <ThemedText type="smallBold">
              {config.supportsTools == null
                ? '尚未测试'
                : config.supportsTools
                  ? '支持 Function Calling'
                  : 'JSON 文本兼容模式'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {latency != null ? `最近延迟 ${latency}ms · ` : ''}
              计划仍会经过本地结构、动作、伤病、重量和营养校验。
            </ThemedText>
          </View>
        </Row>
      </Card>

      <Button onPress={test} loading={testing} disabled={loading || saving}>
        测试连接并检测能力
      </Button>
      <View style={styles.gap} />
      <Button variant="secondary" onPress={save} loading={saving} disabled={loading || testing}>
        保存全部模型配置
      </Button>

      <SectionTitle>近 30 天模型质量</SectionTitle>
      {metrics.length ? (
        metrics.map((metric) => (
          <Card key={`${metric.providerKind}:${metric.providerId}`} style={styles.metricCard}>
            <ThemedText type="smallBold">{metricLabel(metric)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              平均 {metric.averageLatencyMs}ms · P50 {metric.p50LatencyMs}ms · P95 {metric.p95LatencyMs}ms
              {'\n'}通过率 {percent(metric.passRate)} · 成本 ${metric.estimatedCostUsd.toFixed(4)} · 降级率 {percent(metric.degradationRate)}
            </ThemedText>
          </Card>
        ))
      ) : (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            暂无执行数据。完成一次计划生成或每日调整后会显示统计。
          </ThemedText>
        </Card>
      )}

      <Card style={styles.privacyCard}>
        <ThemedText type="smallBold">发送给模型的数据</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          生成计划时会发送训练目标、身体数据、器械、伤病标签、近期训练摘要与可用动作列表。训练原始记录不会自动上传；是否留存由你的 API 服务商决定。
        </ThemedText>
      </Card>
    </ScreenContainer>
  );
}

function validConfig(config: AIConfig): boolean {
  return (
    /^https:\/\//i.test(config.baseUrl.trim()) &&
    !!config.model.trim() &&
    !!config.apiKey.trim()
  );
}

function numeric(value: string): number {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function percent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

function metricLabel(metric: IntelligenceMetric): string {
  const kind =
    metric.providerKind === 'on_device'
      ? '端侧模型'
      : metric.providerKind === 'cloud'
        ? '云端模型'
        : metric.providerKind === 'template'
          ? '本地模板'
          : '未知模型';
  return `${kind} · ${metric.providerId} · ${metric.runs} 次`;
}

const styles = StyleSheet.create({
  header: { marginBottom: Spacing.three },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { marginTop: Spacing.one, lineHeight: 19 },
  statusRow: { alignItems: 'flex-start' },
  flex: { flex: 1 },
  gap: { height: Spacing.two },
  priceRow: { gap: Spacing.two },
  metricCard: { marginBottom: Spacing.two },
  privacyCard: { marginTop: Spacing.four },
});
