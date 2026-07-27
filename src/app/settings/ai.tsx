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
import { useTheme } from '@/hooks/use-theme';

export default function AISettingsScreen() {
  const theme = useTheme();
  const [config, setConfig] = useState<AIConfig>(defaultAIConfig());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    loadAIConfig()
      .then((stored) => {
        if (stored) setConfig(stored);
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
    if (!validConfig(config)) {
      Alert.alert('配置不完整', '请填写 HTTPS Base URL、API Key 和模型名。');
      return;
    }
    setSaving(true);
    try {
      await saveAIConfig(config);
      Alert.alert('已保存', 'API Key 不会写入 Nexset 数据库或同步记录。');
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
        保存配置
      </Button>

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
  privacyCard: { marginTop: Spacing.four },
});
