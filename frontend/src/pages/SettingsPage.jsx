import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Key, 
  User, 
  CheckCircle2, 
  Save, 
  RefreshCw,
  Copy,
  Smartphone,
  Plus,
  Trash2,
  Star,
  AlertCircle
} from 'lucide-react';
import AddPhoneNumberModal from '../components/AddPhoneNumberModal';

export default function SettingsPage() {
  const { user, token, refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingMeta, setSavingMeta] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [metaHealth, setMetaHealth] = useState(null);
  const [copied, setCopied] = useState(false);

  // Phone numbers state & modal
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [showAddPhoneModal, setShowAddPhoneModal] = useState(false);

  // Meta Settings Form
  const [metaSettings, setMetaSettings] = useState({
    WHATSAPP_API_TOKEN: '',
    WHATSAPP_PHONE_NUMBER_ID: '',
    WHATSAPP_BUSINESS_ACCOUNT_ID: '',
    WEBHOOK_VERIFY_TOKEN: '',
    BROADCAST_DELAY_MS: '250'
  });

  // Profile Form
  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    loadSettings();
    loadPhoneNumbers();
  }, []);

  async function loadPhoneNumbers() {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch('/api/phone-numbers', { headers });
      const data = await res.json();
      if (data.success && data.data) {
        setPhoneNumbers(data.data);
      }
    } catch (err) {
      console.error('Failed to load phone numbers:', err);
    }
  }

  async function handleSetDefaultPhone(id) {
    try {
      const res = await fetch(`/api/phone-numbers/${id}/default`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        flash('Primary default WhatsApp line updated.');
        loadPhoneNumbers();
        loadSettings();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDeletePhone(id, displayName) {
    if (!confirm(`Are you sure you want to remove '${displayName}' from the platform?`)) return;
    try {
      const res = await fetch(`/api/phone-numbers/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        flash(data.message || 'WhatsApp phone number removed.');
        loadPhoneNumbers();
        loadSettings();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert(err.message);
    }
  }

  async function loadSettings() {
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch('/api/settings', { headers });
      const data = await res.json();
      const s = data.settings || data.data || {};
      if (data.success) {
        setMetaSettings({
          WHATSAPP_API_TOKEN: s.WHATSAPP_API_TOKEN || '',
          WHATSAPP_PHONE_NUMBER_ID: s.WHATSAPP_PHONE_NUMBER_ID || '',
          WHATSAPP_BUSINESS_ACCOUNT_ID: s.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
          WEBHOOK_VERIFY_TOKEN: s.WEBHOOK_VERIFY_TOKEN || '',
          BROADCAST_DELAY_MS: s.BROADCAST_DELAY_MS !== undefined ? String(s.BROADCAST_DELAY_MS) : '250'
        });
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  }

  function flash(msg) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  async function handleVerifyMeta() {
    setVerifying(true);
    setMetaHealth(null);
    try {
      const res = await fetch('/api/settings/verify-meta');
      const data = await res.json();
      setMetaHealth(data);
    } catch (err) {
      setMetaHealth({ success: false, message: err.message });
    } finally {
      setVerifying(false);
    }
  }

  async function handleSaveMeta(e) {
    e.preventDefault();
    setSavingMeta(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(metaSettings)
      });
      const data = await res.json();
      if (data.success) {
        flash('Meta Cloud API credentials saved successfully!');
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    if (profileForm.newPassword && profileForm.newPassword !== profileForm.confirmPassword) {
      alert('New passwords do not match.');
      return;
    }

    setSavingProfile(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(profileForm)
      });
      const data = await res.json();
      if (data.success) {
        flash('Profile updated successfully!');
        setProfileForm(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
        if (refreshUser) refreshUser();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingProfile(false);
    }
  }

  function copyWebhookUrl() {
    const url = `${window.location.origin}/webhook`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
          Platform Settings & Meta Integration
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
          Meta WhatsApp Cloud API integration tokens, webhook endpoints, and account security.
        </p>
      </div>

      {successMsg && (
        <div style={{
          background: '#DCFCE7',
          border: '1px solid #BBF7D0',
          borderRadius: '8px',
          padding: '12px 18px',
          color: '#15803D',
          fontSize: '0.875rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '20px'
        }}>
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* WhatsApp Connected Phone Lines Section */}
      <div className="saas-card" style={{ padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Smartphone size={20} color="var(--brand-wa)" /> Connected WhatsApp Phone Lines
            </h2>
            <p style={{ fontSize: '0.825rem', color: '#64748B', marginTop: '2px' }}>
              Registered Meta WABA phone numbers available for broadcasts, automations, and inbound customer chat.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddPhoneModal(true)}
            className="btn btn-action-green"
            style={{ gap: '6px', padding: '8px 14px', fontSize: '0.825rem' }}
          >
            <Plus size={16} />
            <span>Add WhatsApp Number</span>
          </button>
        </div>

        {phoneNumbers.length === 0 ? (
          <div style={{
            background: '#F8FAFC',
            border: '2px dashed #CBD5E1',
            borderRadius: '12px',
            padding: '36px 20px',
            textAlign: 'center'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: '#F0FDF4',
              color: '#16A34A',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '12px'
            }}>
              <Smartphone size={24} />
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A' }}>
              No WhatsApp Numbers Connected
            </div>
            <div style={{ fontSize: '0.825rem', color: '#64748B', maxWidth: '460px', margin: '6px auto 18px auto' }}>
              Connect your Meta WhatsApp Cloud API phone number to start dispatching broadcasts, automated booking notifications, and receiving live webhook statuses.
            </div>
            <button
              type="button"
              onClick={() => setShowAddPhoneModal(true)}
              className="btn btn-action-green"
              style={{ gap: '6px', margin: '0 auto', padding: '8px 16px' }}
            >
              <Plus size={16} />
              <span>Connect Your First WhatsApp Line</span>
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {phoneNumbers.map(phone => (
              <div
                key={phone.id}
                style={{
                  background: '#FFFFFF',
                  border: phone.is_default ? '1.5px solid #16A34A' : '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '16px',
                  position: 'relative',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                {phone.is_default && (
                  <div style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    background: '#DCFCE7',
                    color: '#15803D',
                    border: '1px solid #BBF7D0',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    fontSize: '0.675rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <Star size={11} fill="#15803D" /> PRIMARY DEFAULT
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '8px',
                    background: '#F0FDF4',
                    border: '1px solid #DCFCE7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#16A34A',
                    flexShrink: 0
                  }}>
                    <Smartphone size={20} />
                  </div>
                  <div style={{ minWidth: 0, paddingRight: phone.is_default ? '95px' : '0' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {phone.display_name}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748B', fontFamily: 'var(--font-mono)' }}>
                      {phone.phone_number}
                    </div>
                  </div>
                </div>

                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '8px 10px', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: '#64748B', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span>Phone ID:</span>
                    <span style={{ color: '#0F172A', fontWeight: 600 }}>{phone.phone_number_id}</span>
                  </div>
                  {phone.waba_id && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>WABA ID:</span>
                      <span style={{ color: '#0F172A', fontWeight: 600 }}>{phone.waba_id}</span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {!phone.is_default && (
                    <button
                      type="button"
                      onClick={() => handleSetDefaultPhone(phone.id)}
                      className="btn btn-secondary"
                      style={{ flex: 1, padding: '6px 10px', fontSize: '0.75rem' }}
                    >
                      <Star size={13} />
                      <span>Set as Default</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeletePhone(phone.id, phone.display_name)}
                    className="btn btn-danger"
                    style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                    title="Delete WhatsApp line"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(320px, 1fr)', gap: '24px', alignItems: 'start' }}>
        {/* Left Column: Meta Cloud API Settings */}
        <div className="saas-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Key size={18} color="var(--brand-wa)" /> Meta WhatsApp Cloud API Credentials
            </h2>
            <button
              type="button"
              onClick={handleVerifyMeta}
              disabled={verifying}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.78rem', gap: '6px' }}
            >
              <RefreshCw size={13} className={verifying ? 'pulse-glow' : ''} />
              <span>{verifying ? 'Testing...' : 'Test Connection'}</span>
            </button>
          </div>

          {metaHealth && (
            <div style={{
              background: metaHealth.success ? '#DCFCE7' : '#FEE2E2',
              border: `1px solid ${metaHealth.success ? '#BBF7D0' : '#FECACA'}`,
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '18px',
              fontSize: '0.825rem',
              color: metaHealth.success ? '#15803D' : '#DC2626'
            }}>
              <strong>{metaHealth.success ? 'Meta API Connection Verified:' : 'Meta API Connection Issue:'}</strong>{' '}
              {metaHealth.message || (metaHealth.success ? 'Phone Verified & Connected' : 'Check Access Token & Phone ID')}
            </div>
          )}

          <form onSubmit={handleSaveMeta} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 600, color: '#334155', marginBottom: '5px' }}>
                Meta Permanent System User Access Token
              </label>
              <input
                type="password"
                placeholder="EAA..."
                className="saas-input"
                value={metaSettings.WHATSAPP_API_TOKEN}
                onChange={e => setMetaSettings({ ...metaSettings, WHATSAPP_API_TOKEN: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 600, color: '#334155', marginBottom: '5px' }}>
                  Phone Number ID
                </label>
                <input
                  type="text"
                  placeholder="567890123456789"
                  className="saas-input"
                  value={metaSettings.WHATSAPP_PHONE_NUMBER_ID}
                  onChange={e => setMetaSettings({ ...metaSettings, WHATSAPP_PHONE_NUMBER_ID: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 600, color: '#334155', marginBottom: '5px' }}>
                  WABA ID (Business Account)
                </label>
                <input
                  type="text"
                  placeholder="123456789012345"
                  className="saas-input"
                  value={metaSettings.WHATSAPP_BUSINESS_ACCOUNT_ID}
                  onChange={e => setMetaSettings({ ...metaSettings, WHATSAPP_BUSINESS_ACCOUNT_ID: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 600, color: '#334155', marginBottom: '5px' }}>
                Webhook Verify Token
              </label>
              <input
                type="text"
                placeholder="konkantrip_bulk_secret_2026"
                className="saas-input"
                value={metaSettings.WEBHOOK_VERIFY_TOKEN}
                onChange={e => setMetaSettings({ ...metaSettings, WEBHOOK_VERIFY_TOKEN: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 600, color: '#334155', marginBottom: '5px' }}>
                Default Broadcast Dispatch Throttle Delay (milliseconds)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  step="25"
                  placeholder="250"
                  className="saas-input"
                  style={{ maxWidth: '180px' }}
                  value={metaSettings.BROADCAST_DELAY_MS}
                  onChange={e => setMetaSettings({ ...metaSettings, BROADCAST_DELAY_MS: e.target.value })}
                />
                <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 500 }}>
                  ms per message ({metaSettings.BROADCAST_DELAY_MS > 0 ? (1000 / Number(metaSettings.BROADCAST_DELAY_MS)).toFixed(1) : '∞'} msgs/sec)
                </span>
              </div>
              <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', marginTop: '4px' }}>
                Default pause between outbound messages in bulk broadcasts. Recommended: 200ms - 350ms to stay safely within Meta Cloud API rate limits.
              </span>
            </div>

            {/* Webhook Callback Info Box */}
            <div style={{
              background: '#F8FAFC',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '0.78rem',
              color: '#475569'
            }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>Meta Webhook Callback URL:</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', background: '#FFFFFF', padding: '6px 10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{window.location.origin}/webhook</span>
                <button
                  type="button"
                  onClick={copyWebhookUrl}
                  style={{ background: 'none', border: 'none', color: 'var(--brand-wa)', cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Copy size={13} />
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '6px' }}>
                Subscribe to <code>messages</code> webhooks on Meta App Dashboard to receive live delivery status & customer replies.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
              <button
                type="submit"
                disabled={savingMeta}
                className="btn btn-primary"
              >
                <Save size={15} />
                <span>{savingMeta ? 'Saving...' : 'Save Meta Credentials'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: User Profile & Security */}
        <div className="saas-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0F172A', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User size={18} color="var(--brand-wa)" /> Account Profile & Password
          </h2>

          <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 600, color: '#334155', marginBottom: '5px' }}>
                Full Name
              </label>
              <input
                type="text"
                required
                className="saas-input"
                value={profileForm.name}
                onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 600, color: '#334155', marginBottom: '5px' }}>
                Phone Number
              </label>
              <input
                type="text"
                placeholder="+91..."
                className="saas-input"
                value={profileForm.phone}
                onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })}
              />
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px', marginTop: '6px' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', marginBottom: '10px' }}>
                Change Password (Optional)
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748B', marginBottom: '4px' }}>
                    Current Password
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    className="saas-input"
                    value={profileForm.currentPassword}
                    onChange={e => setProfileForm({ ...profileForm, currentPassword: e.target.value })}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748B', marginBottom: '4px' }}>
                    New Password
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    className="saas-input"
                    value={profileForm.newPassword}
                    onChange={e => setProfileForm({ ...profileForm, newPassword: e.target.value })}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748B', marginBottom: '4px' }}>
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    className="saas-input"
                    value={profileForm.confirmPassword}
                    onChange={e => setProfileForm({ ...profileForm, confirmPassword: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
              <button
                type="submit"
                disabled={savingProfile}
                className="btn btn-secondary"
              >
                <Save size={15} />
                <span>{savingProfile ? 'Updating...' : 'Update Profile'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Add WhatsApp Number Modal */}
      <AddPhoneNumberModal
        isOpen={showAddPhoneModal}
        onClose={() => setShowAddPhoneModal(false)}
        onPhoneAdded={() => {
          loadPhoneNumbers();
          loadSettings();
        }}
      />
    </div>
  );
}
