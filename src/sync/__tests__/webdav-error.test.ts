import { describe, expect, it } from '@jest/globals';

import { webDavTransportErrorMessage } from '@/sync/webdav-error';

describe('webDavTransportErrorMessage', () => {
  it('explains ATS cleartext failures', () => {
    expect(
      webDavTransportErrorMessage(
        new Error(
          'The resource could not be loaded because the App Transport Security policy requires the use of a secure connection.',
        ),
      ),
    ).toContain('HTTP');
  });

  it('explains TLS trust failures', () => {
    expect(
      webDavTransportErrorMessage(
        new Error('A TLS error caused the secure connection to fail.'),
      ),
    ).toContain('HTTPS 证书');
  });

  it('leaves unrelated errors unchanged', () => {
    expect(webDavTransportErrorMessage(new Error('Network request failed'))).toBeNull();
  });
});
