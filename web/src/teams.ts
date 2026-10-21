import { app } from '@microsoft/teams-js';

export type Theme = 'light' | 'dark' | 'contrast';

const fromTeams = (t: string | undefined): Theme =>
  t === 'dark' ? 'dark' : t === 'contrast' ? 'contrast' : 'light';

/**
 * Connects to Teams when running inside it. Outside Teams (opening
 * https://localhost:53917 in a browser) it resolves to null and the app
 * works the same, following the system theme.
 */
export async function initTeams(onTheme: (t: Theme) => void): Promise<boolean> {
  if (window.parent === window) return false;
  try {
    await Promise.race([
      app.initialize(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    const ctx = await app.getContext();
    onTheme(fromTeams(ctx.app.theme));
    app.registerOnThemeChangeHandler((t) => onTheme(fromTeams(t)));
    app.notifySuccess();
    return true;
  } catch {
    return false;
  }
}
