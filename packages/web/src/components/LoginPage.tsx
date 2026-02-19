import { useState, useRef, useEffect } from 'react';

interface LoginPageProps {
  onLogin: (token: string) => void;
  error: string | null;
  loading: boolean;
}

export function LoginPage({ onLogin, error, loading }: LoginPageProps) {
  const [token, setToken] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!token.trim() || loading) return;
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
              disabled={loading}
              autoComplete="off"
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button
            className="login-btn"
            type="submit"
            disabled={!token.trim() || loading}
          >
            {loading ? 'Verifying...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
