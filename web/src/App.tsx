import { useEffect, useState } from 'react';
import { Gate } from './ui/Gate';
import { Shell } from './ui/Shell';
import { initTeams, type Theme } from './teams';
import { useVault, VaultProvider } from './vault/vault-store';

function Root() {
  const { status } = useVault();
  return status.kind === 'unlocked' ? <Shell /> : <Gate />;
}

export default function App() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    initTeams(setTheme);
  }, []);

  useEffect(() => {
    // Outside Teams no theme arrives, and the CSS follows the system setting.
    if (theme) document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <VaultProvider>
      <Root />
    </VaultProvider>
  );
}
