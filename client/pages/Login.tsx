import React, { useState } from 'react';
import { useAuth, BRANDING } from '../auth';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui';

const DEMOS = [
  { role: 'Admin', email: 'admin@regalpark.demo' },
  { role: 'Staff', email: 'sales@regalpark.demo' },
  { role: 'Agent', email: 'agent@regalpark.demo' },
  { role: 'Broker', email: 'broker@regalpark.demo' },
  { role: 'Owner', email: 'owner@regalpark.demo' },
  { role: 'Client', email: 'client@regalpark.demo' },
];

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async (e: string, p: string) => {
    setBusy(true);
    setError('');
    try {
      await login(e, p);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-brand">
        <div className="login-logo">REGAL PARK</div>
        <div className="login-by">by Sterlitee</div>
        <p className="login-tag">{BRANDING.tagline}</p>
        <p className="login-sub">4 &amp; 5 BHK Private Villas · Neotown, Electronic City</p>
        <p className="login-rera">RERA {BRANDING.rera}</p>
      </div>
      <div className="login-form-side">
        <form className="login-card" onSubmit={e => { e.preventDefault(); void go(email, password); }}>
          <h2>Sign in</h2>
          <p className="muted">{BRANDING.productName}</p>
          {error && <div className="form-error">{error}</div>}
          <div className="form-field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" disabled={busy}>Sign in</Button>
          <div className="demo-title">Quick demo login</div>
          <div className="demo-grid">
            {DEMOS.map(d => (
              <Button key={d.role} type="button" variant="ghost" disabled={busy} onClick={() => void go(d.email, 'demo123')}>{d.role}</Button>
            ))}
          </div>
          <div className="login-roles-link"><Link to="/roles">See all roles →</Link></div>
        </form>
      </div>
    </div>
  );
}
