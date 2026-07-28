import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/components/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Input, Row, SectionTitle } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  clearWebDavConfig,
  defaultWebDavConfig,
  isWebDavConfigured,
  loadWebDavConfig,
  saveWebDavConfig,
  testWebDavConnection,
  type WebDavConfig,
} from '@/sync/webdav-config';

export default function WebDavSettingsScreen() {
  const theme = useTheme();
  const [config, setConfig] = useState<WebDavConfig>(defaultWebDavConfig());
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    loadWebDavConfig()
      .then((stored) => {
        if (stored) setConfig(stored);
      })
      .finally(() => setLoading(false));
  }, []);

  async function connect() {
    setConnecting(true);
    try {
      await testWebDavConnection(config);
      const saved = await saveWebDavConfig(config);
      setConfig(saved);
      Alert.alert('WebDAV 已连接', '服务器连接测试通过，配置已安全保存在本机。');
    } catch (error) {
      Alert.alert('连接失败', error instanceof Error ? error.message : '无法连接 WebDAV 服务器');
    } finally {
      setConnecting(false);
    }
  }

  function disconnect() {
    Alert.alert('断开 WebDAV？', '服务器地址、用户名和本机保存的密码将被清除。', [
      { text: '取消', style: 'cancel' },
      {
        text: '断开并清除',
        style: 'destructive',
        onPress: () => {
          void clearWebDavConfig().then(() => setConfig(defaultWebDavConfig()));
        },
      },
    ]);
  }

  const configured = isWebDavConfigured(config);

  return (
    <ScreenContainer>
      <Row style={styles.header}>
        <Pressable accessibilityLabel="返回" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
        <View style={styles.flex}>
          <ThemedText type="subtitle">WebDAV 同步</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            连接你自己的加密 WebDAV 目录
          </ThemedText>
        </View>
      </Row>

      <Card>
        <Row style={styles.statusRow}>
          <Ionicons
            name={configured ? 'checkmark-circle' : 'cloud-offline-outline'}
            size={23}
            color={configured ? theme.success : theme.textSecondary}
          />
          <View style={styles.flex}>
            <ThemedText type="smallBold">
              {configured ? 'WebDAV 已连接' : '尚未连接 WebDAV'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.statusDetail}>
              {configured
                ? `已连接 ${config.baseUrl}`
                : '连接成功后，首页的 WebDAV 提示卡片会自动隐藏。'}
            </ThemedText>
          </View>
        </Row>
      </Card>

      <SectionTitle>服务器地址</SectionTitle>
      <Input
        value={config.baseUrl}
        onChangeText={(baseUrl) => setConfig((current) => ({ ...current, baseUrl, connectedAt: 0 }))}
        placeholder="https://dav.example.com/nexset/"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
        为保护账号信息，只接受 HTTPS 地址。建议为 Nexset 创建独立目录。
      </ThemedText>

      <SectionTitle>用户名</SectionTitle>
      <Input
        value={config.username}
        onChangeText={(username) => setConfig((current) => ({ ...current, username, connectedAt: 0 }))}
        placeholder="WebDAV 用户名"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <SectionTitle>密码</SectionTitle>
      <Input
        value={config.password}
        onChangeText={(password) => setConfig((current) => ({ ...current, password, connectedAt: 0 }))}
        placeholder="密码或应用专用密码"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
        密码只保存在系统安全存储中，不会写入训练数据库或同步记录。
      </ThemedText>

      <View style={styles.actions}>
        <Button onPress={connect} loading={connecting} disabled={loading || Platform.OS === 'web'}>
          测试连接并保存
        </Button>
        {configured ? (
          <>
            <View style={styles.gap} />
            <Button variant="danger" onPress={disconnect} disabled={connecting}>
              断开并清除配置
            </Button>
          </>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: Spacing.three, alignItems: 'center' },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  statusRow: { alignItems: 'flex-start' },
  statusDetail: { marginTop: 2, lineHeight: 19 },
  hint: { marginTop: Spacing.one, lineHeight: 19 },
  actions: { marginTop: Spacing.four },
  gap: { height: Spacing.two },
});
