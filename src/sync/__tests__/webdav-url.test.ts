import { describe, expect, it } from '@jest/globals';

import {
  isLocalNetworkHostname,
  isSupportedWebDavUrl,
} from '@/sync/webdav-url';

describe('WebDAV URL validation', () => {
  it.each([
    'https://dav.example.com/nexset/',
    'http://192.168.1.20:5005/nexset/',
    'http://10.0.0.8/nexset/',
    'http://172.16.0.8/nexset/',
    'http://nas.local/nexset/',
    'http://localhost:8080/webdav',
    'http://[fd00::1]:5005/webdav',
  ])('accepts secure or local-network WebDAV URL %s', (url) => {
    expect(isSupportedWebDavUrl(url)).toBe(true);
  });

  it.each([
    '',
    'dav.example.com/nexset',
    'ftp://dav.example.com/nexset',
    'http://',
    'http://dav.example.com/nexset/',
    'http://8.8.8.8/nexset/',
  ])(
    'rejects unsupported WebDAV URL %s',
    (url) => {
      expect(isSupportedWebDavUrl(url)).toBe(false);
    },
  );
});

describe('local-network hostname validation', () => {
  it.each(['localhost', 'nas', 'nas.local', '127.0.0.1', '169.254.1.2', '192.168.1.2'])(
    'accepts local hostname %s',
    (hostname) => {
      expect(isLocalNetworkHostname(hostname)).toBe(true);
    },
  );

  it.each([
    'dav.example.com',
    'fcloud.com',
    '8.8.8.8',
    '192.168.01.2',
    '192.168.1.999',
  ])('rejects public or malformed hostname %s', (hostname) => {
    expect(isLocalNetworkHostname(hostname)).toBe(false);
  });
});
