import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, WifiOff } from 'lucide-react';
import './Pwa.css';

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function PwaStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const reloadRequested = useRef(false);

  useEffect(() => {
    const connection = () => setOnline(navigator.onLine);
    const install = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    const installed = () => setInstallPrompt(null);
    const controlled = () => {
      if (reloadRequested.current) window.location.reload();
    };
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    window.addEventListener('beforeinstallprompt', install);
    window.addEventListener('appinstalled', installed);
    let mounted = true;
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', controlled);
      navigator.serviceWorker
        .register('/service-worker.js', { scope: '/', updateViaCache: 'none' })
        .then((value) => {
          if (!mounted) return;
          registration.current = value;
          if (value.waiting) setUpdateReady(true);
          value.addEventListener('updatefound', () => {
            const worker = value.installing;
            worker?.addEventListener('statechange', () => {
              if (mounted && worker.state === 'installed' && navigator.serviceWorker.controller)
                setUpdateReady(true);
            });
          });
        })
        .catch((error: unknown) => console.error('Offline shell preparation failed:', error));
    }
    return () => {
      mounted = false;
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
      window.removeEventListener('beforeinstallprompt', install);
      window.removeEventListener('appinstalled', installed);
      navigator.serviceWorker?.removeEventListener('controllerchange', controlled);
    };
  }, []);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }
  function update() {
    if (!registration.current?.waiting) return;
    reloadRequested.current = true;
    registration.current.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
  if (online && !installPrompt && !updateReady) return null;
  return (
    <aside className="q-pwa" aria-label="App connection and installation">
      {!online && (
        <p role="status">
          <WifiOff size={18} />
          <span>
            You are offline. Reconnect to view your account, place bets or request deposits.
          </span>
        </p>
      )}
      {online && updateReady && (
        <div>
          <span>A new version of Quizio is ready.</span>
          <button type="button" onClick={update}>
            <RefreshCw size={16} />
            Update app
          </button>
        </div>
      )}
      {online && installPrompt && !updateReady && (
        <div>
          <span>Keep Quizio on your home screen.</span>
          <button type="button" onClick={() => void install()}>
            <Download size={16} />
            Install app
          </button>
        </div>
      )}
    </aside>
  );
}
