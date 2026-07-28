export function webDavTransportErrorMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (/app transport security|requires the use of a secure connection/i.test(message)) {
    return '当前安装版本未允许 HTTP 连接，请重新安装最新版 Nexset 后重试';
  }

  if (/tls error|secure connection to fail|certificate|ssl/i.test(message)) {
    return [
      'HTTPS 证书未通过系统校验。',
      '请使用受信任 CA 签发、未过期且与访问地址匹配的证书；',
      '自签名证书需先在设备中安装并信任。',
    ].join('');
  }

  return null;
}
