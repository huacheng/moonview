import { useState, useRef, useEffect } from 'react';

interface LoginPageProps {
  onLogin: (token: string) => void;
  error: string | null;
  loading: boolean;
}

/** Extract retryAfter seconds from error message like "Locked for 60s." */
function parseRetryAfter(error: string | null): number {
  if (!error) return 0;
  const m = error.match(/(\d+)s[.\s]/);
  return m ? parseInt(m[1], 10) : 0;
}

export function LoginPage({ onLogin, error, loading }: LoginPageProps) {
  const [token, setToken] = useState('');
  const [countdown, setCountdown] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Start countdown when error contains retry time
  useEffect(() => {
    const secs = parseRetryAfter(error);
    if (secs > 0) {
      setCountdown(secs);
    }
  }, [error]);

  // Tick countdown
  useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(id); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [countdown]);

  const locked = countdown > 0;

  function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!token.trim() || loading || locked) return;
    onLogin(token.trim());
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">NB</div>
        <h1 className="login-title">Notebook AI</h1>
        <p className="login-subtitle">Enter your access token to continue</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label className="login-label" htmlFor="auth-token">
              Access Token
            </label>
            <input
              ref={inputRef}
              id="auth-token"
              className="login-input"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your token here"
              disabled={loading || locked}
              autoComplete="off"
            />
          </div>

          {error && <div className="login-error">{locked ? `${error} (${countdown}s)` : error}</div>}

          <button
            className="login-btn"
            type="submit"
            disabled={!token.trim() || loading || locked}
          >
            {loading ? 'Verifying...' : locked ? `Wait ${countdown}s` : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
