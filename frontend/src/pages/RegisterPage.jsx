import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Smartphone, Lock, Mail, User, Phone, ArrowRight, AlertCircle, ShieldAlert } from 'lucide-react';

export default function RegisterPage({ onSwitchToLogin }) {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      await register(name, email, phone, password);
    } catch (err) {
      setError(err.message || 'Registration failed.');
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
        maxWidth: '460px',
        padding: '36px',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--border-color)',
        animation: 'fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{
            width: '50px',
            height: '50px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #128C7E, #0d7064)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
            boxShadow: '0 4px 14px rgba(18, 140, 126, 0.25)'
          }}>
            <Smartphone size={26} color="#FFFFFF" strokeWidth={2.2} />
          </div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#0F172A', marginBottom: '4px' }}>
            Register New Account
          </h1>
          <p style={{ fontSize: '0.825rem', color: '#64748B' }}>
            Join KonkanTrip's WhatsApp Marketing & Automation Engine
          </p>
        </div>

        {/* Security / Number policy notice */}
        <div style={{
          background: '#EFF6FF',
          border: '1px solid #BFDBFE',
          borderRadius: '8px',
          padding: '10px 12px',
          fontSize: '0.78rem',
          color: '#1E40AF',
          display: 'flex',
          gap: '10px',
          marginBottom: '18px',
          lineHeight: 1.4
        }}>
          <ShieldAlert size={17} style={{ flexShrink: 0, marginTop: '2px', color: '#2563EB' }} />
          <span>
            <strong>RBAC Notice:</strong> New accounts are created as Agent Operators. WhatsApp sender lines are centrally configured and assigned by the <strong>Master Admin</strong>.
          </span>
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
            marginBottom: '18px'
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
              Full Name *
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                required
                className="saas-input"
                placeholder="Rohit Patil"
                value={name}
                onChange={e => setName(e.target.value)}
                style={{ paddingLeft: '36px' }}
              />
              <User size={15} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
              Work Email Address *
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                required
                className="saas-input"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ paddingLeft: '36px' }}
              />
              <Mail size={15} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
              Mobile Number (Optional)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="saas-input"
                placeholder="+91 98200 12345"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                style={{ paddingLeft: '36px' }}
              />
              <Phone size={15} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                Password *
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  required
                  className="saas-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={{ paddingLeft: '32px' }}
                />
                <Lock size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                Confirm Password *
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  required
                  className="saas-input"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  style={{ paddingLeft: '32px' }}
                />
                <Lock size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-action-green"
            style={{ width: '100%', padding: '11px', marginTop: '6px' }}
          >
            {loading ? 'Creating Account...' : (
              <>
                <span>Complete Registration</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Switch to Login */}
        <div style={{ textAlign: 'center', marginTop: '18px', fontSize: '0.825rem', color: '#64748B' }}>
          Already registered?{' '}
          <button
            type="button"
            onClick={onSwitchToLogin}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--brand-wa)',
              fontWeight: 700,
              cursor: 'pointer',
              padding: '0 4px'
            }}
          >
            Sign In Here
          </button>
        </div>
      </div>
    </div>
  );
}
