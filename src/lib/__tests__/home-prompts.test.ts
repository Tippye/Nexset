import { describe, expect, it } from '@jest/globals';

import { getHomePromptVisibility } from '@/lib/home-prompts';

describe('home setup prompts', () => {
  it('shows both unconfigured prompts on iOS', () => {
    expect(
      getHomePromptVisibility({
        platform: 'ios',
        healthEnabled: false,
        webdavConfigured: false,
        dismissals: { health: false, webdav: false },
      }),
    ).toEqual({ health: true, webdav: true });
  });

  it('hides a prompt after configuration or dismissal', () => {
    expect(
      getHomePromptVisibility({
        platform: 'ios',
        healthEnabled: true,
        webdavConfigured: false,
        dismissals: { health: false, webdav: true },
      }),
    ).toEqual({ health: false, webdav: false });
  });

  it('never shows Apple setup prompts on other platforms', () => {
    expect(
      getHomePromptVisibility({
        platform: 'android',
        healthEnabled: false,
        webdavConfigured: false,
        dismissals: { health: false, webdav: false },
      }),
    ).toEqual({ health: false, webdav: false });
  });
});
