function isPrivateIpv4(hostname: string): boolean {
  const segments = hostname.split('.');
  if (segments.length !== 4) {
    return false;
  }

  const octets = segments.map(Number);
  if (
    octets.some(
      (octet, index) =>
        !Number.isInteger(octet) ||
        octet < 0 ||
        octet > 255 ||
        String(octet) !== segments[index],
    )
  ) {
    return false;
  }

  const [first, second] = octets;
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();
  if (!normalized.includes(':')) {
    return false;
  }

  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized)
  );
}

export function isLocalNetworkHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();

  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    (!normalized.includes('.') && !normalized.includes(':')) ||
    isPrivateIpv4(normalized) ||
    isPrivateIpv6(normalized)
  );
}

export function isSupportedWebDavUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    if (!url.hostname) {
      return false;
    }

    return (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && isLocalNetworkHostname(url.hostname))
    );
  } catch {
    return false;
  }
}
