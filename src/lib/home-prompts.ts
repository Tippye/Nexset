export type HomePromptDismissals = {
  health: boolean;
  webdav: boolean;
};

export type HomePromptVisibility = {
  health: boolean;
  webdav: boolean;
};

export const DEFAULT_HOME_PROMPT_DISMISSALS: HomePromptDismissals = {
  health: false,
  webdav: false,
};

export function getHomePromptVisibility(input: {
  platform: string;
  healthEnabled: boolean;
  webdavConfigured: boolean;
  dismissals: HomePromptDismissals;
}): HomePromptVisibility {
  if (input.platform !== 'ios') {
    return { health: false, webdav: false };
  }

  return {
    health: !input.healthEnabled && !input.dismissals.health,
    webdav: !input.webdavConfigured && !input.dismissals.webdav,
  };
}
