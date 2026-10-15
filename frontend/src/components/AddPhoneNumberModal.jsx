import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Smartphone, X, CheckCircle2, AlertCircle, Info, Plus } from 'lucide-react';

export default function AddPhoneNumberModal({ isOpen, onClose, onSuccess }) {
  const { token } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [isDefault, setIsDefault] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!displayName.trim()) {
      setError('Line Display Name is required (e.g. "Primary Booking Line").');
      return;
    }
    if (!phoneNumber.trim()) {
      setError('WhatsApp Phone Number with country code is required (e.g. +91 98200 12345).');
      return;
    }
    if (!phoneNumberId.trim()) {
      setError('Meta Phone Number ID is required from Meta Developer Dashboard.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/phone-numbers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          displayName: displayName.trim(),
          phoneNumber: phoneNumber.trim(),
          phoneNumberId: phoneNumberId.trim(),
          wabaId: wabaId.trim() || undefined,
          isDefault
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to register WhatsApp phone line.');
      }

      // Reset form
      setDisplayName('');
      setPhoneNumber('');
      setPhoneNumberId('');
      setWabaId('');
      setIsDefault(true);

      if (onSuccess) {
        onSuccess(data.data);
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.6)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      padding: '20px'
    }}>
      <div className="saas-card" style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        maxWidth: '540px',
        width: '100%',
        padding: '28px',
        boxShadow: 'var(--shadow-xl)',
        border: '1px solid var(--border-color)',
        animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#15803D'
            }}>
              <Smartphone size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                Connect WhatsApp Line
              </h3>
              <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                Register official Meta WhatsApp Business Cloud API number
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div style={{
            background: '#FEE2E2',
            border: '1px solid #FECACA',
            borderRadius: '8px',
            padding: '10px 14px',
            color: '#DC2626',
            fontSize: '0.825rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px'
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '5px' }}>
              Line Display Name *
            </label>
            <input
              type="text"
              required
              className="saas-input"
              placeholder="e.g. Primary Support Line or Outbound Broadcast"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '5px' }}>
              WhatsApp Phone Number (with Country Code) *
            </label>
            <input
              type="text"
              required
              className="saas-input"
              placeholder="+1 234 567 8900"
              value={phoneNumber}
              onChange={e => setPhoneNumber(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '5px' }}>
              Meta Phone Number ID *
            </label>
            <input
              type="text"
              required
              className="saas-input"
              placeholder="e.g. 109876543210987"
              value={phoneNumberId}
              onChange={e => setPhoneNumberId(e.target.value)}
            />
            <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Info size={12} color="#94A3B8" />
              <span>Available in Meta Developer Dashboard &gt; WhatsApp &gt; API Setup &gt; Phone number ID</span>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '5px' }}>
              WhatsApp Business Account ID (WABA ID) (Optional)
            </label>
            <input
              type="text"
              className="saas-input"
              placeholder="e.g. 104523789123456"
              value={wabaId}
              onChange={e => setWabaId(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' }}>
            <input
              type="checkbox"
              id="setDefaultCheck"
              checked={isDefault}
              onChange={e => setIsDefault(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: 'var(--brand-wa)', cursor: 'pointer' }}
            />
            <label htmlFor="setDefaultCheck" style={{ fontSize: '0.825rem', color: '#0F172A', fontWeight: 600, cursor: 'pointer' }}>
              Set as primary sending line for campaigns & automations
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-action-green"
              style={{ gap: '6px' }}
            >
              <Plus size={16} />
              <span>{submitting ? 'Connecting...' : 'Connect WhatsApp Line'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
