import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Smartphone, Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react';

export default function LoginPage({ onSwitchToRegister }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      background: 'var(--bg-primary)'
    }}>
      <div className="saas-card" style={{
        width: '100%',
        maxWidth: '440px',
        padding: '36px',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--border-color)',
        animation: 'fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #128C7E, #0d7064)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 4px 14px rgba(18, 140, 126, 0.25)'
          }}>
            <Smartphone size={28} color="#FFFFFF" strokeWidth={2.2} />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#0F172A', marginBottom: '4px' }}>
            KonkanTrip Engine
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#64748B' }}>
            Sign in to access WhatsApp Broadcaster & Booking Lifecycle Automation
          </p>
        </div>

        {error && (
          <div style={{
            background: '#FEE2E2',
            border: '1px solid #FECACA',
            borderRadius: '8px',
            padding: '10px 14px',
            color: '#DC2626',
            fontSize: '0.825rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '20px'
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Work Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                required
                className="saas-input"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ paddingLeft: '38px' }}
              />
              <Mail size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Security Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                required
                className="saas-input"
                placeholder="••••••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ paddingLeft: '38px' }}
              />
              <Lock size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-action-green"
            style={{ width: '100%', padding: '11px', marginTop: '6px', fontSize: '0.925rem' }}
          >
            {loading ? 'Authenticating...' : (
              <>
                <span>Sign In to Platform</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Switch to Register */}
        <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '0.825rem', color: '#64748B' }}>
          Don't have an account?{' '}
          <button
            type="button"
            onClick={onSwitchToRegister}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--brand-wa)',
              fontWeight: 700,
              cursor: 'pointer',
              padding: '0 4px'
            }}
          >
            Register New User
          </button>
        </div>
      </div>
    </div>
  );
}
