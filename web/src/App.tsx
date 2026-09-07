import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { api, type Me } from './lib/api';
import { useLang, useT } from './i18n';
import Login from './pages/Login';
import Register from './pages/Register';
import Workspace from './pages/Workspace';
import Settings from './pages/Settings';
import Forgot from './pages/Forgot';
import ResetPassword from './pages/ResetPassword';
import Help from './pages/Help';
import Legal from './pages/Legal';
import Lint from './pages/Lint';
import Stats from './pages/Stats';
import OAuthConsent from './pages/OAuthConsent';
import Landing from './pages/Landing';
import Share from './pages/Share';

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined); // undefined = loading
  const location = useLocation();
  const { lang, setLang } = useLang();
  const { t } = useT();
  // The workspace language is the source of truth: after login, switch the UI if it differs
  useEffect(() => { if (me?.workspace.lang && me.workspace.lang !== lang) setLang(me.workspace.lang); }, [me?.workspace.lang]);
  // Only 401 means logged out; transient failures (429, network errors) keep the current state so rate limiting never bounces the user to the login page
  const refresh = () => api.me().then(setMe).catch(e => { if ((e as { status?: number }).status === 401 || me === undefined) setMe(null); });
  useEffect(() => { refresh(); }, [location.pathname === '/login', location.pathname === '/register']);

  if (me === undefined) return <div className="flex h-full items-center justify-center text-ink-soft">{t('app.loading')}</div>;
  const guard = (el: React.ReactNode) => (me ? el : <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />);
  const from = (location.state as { from?: string } | null)?.from;
  return (
    <Routes>
      <Route path="/login" element={me ? <Navigate to={from && from.startsWith('/') ? from : '/'} replace /> : <Login onSignedIn={refresh} />} />
      <Route path="/register" element={me ? <Navigate to="/" replace /> : <Register />} />
      <Route path="/help" element={<Help signedIn={!!me} />} />
      <Route path="/help/:page" element={<Help signedIn={!!me} />} />
      <Route path="/privacy" element={<Legal slug="privacy" signedIn={!!me} />} />
      <Route path="/terms" element={<Legal slug="terms" signedIn={!!me} />} />
      <Route path="/s/:token" element={<Share />} />
      <Route path="/forgot" element={<Forgot />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/settings" element={guard(<Settings me={me!} onSignedOut={() => setMe(null)} />)} />
      <Route path="/lint" element={guard(<Lint me={me!} />)} />
      <Route path="/stats" element={guard(<Stats me={me!} />)} />
      <Route path="/oauth/consent" element={guard(<OAuthConsent me={me!} />)} />
      <Route path="/n/*" element={guard(<Workspace me={me!} onSignedOut={() => setMe(null)} />)} />
      <Route path="/graph" element={guard(<Workspace me={me!} onSignedOut={() => setMe(null)} />)} />
      <Route path="/table" element={guard(<Workspace me={me!} onSignedOut={() => setMe(null)} />)} />
      <Route path="/" element={me ? <Workspace me={me} onSignedOut={() => setMe(null)} /> : <Landing />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
