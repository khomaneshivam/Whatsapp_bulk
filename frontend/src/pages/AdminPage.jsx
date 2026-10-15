import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Users, 
  Smartphone, 
  ShieldCheck, 
  CheckCircle2, 
  Trash2, 
  Star, 
  Eye, 
  Activity, 
  X,
  Plus,
  RefreshCw
} from 'lucide-react';
import AddPhoneNumberModal from '../components/AddPhoneNumberModal';

export default function AdminPage() {
  const { token, user: currentUser, impersonateUser } = useAuth();
  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'phones' | 'overview'
  const [users, setUsers] = useState([]);
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState(null);

  // Phone registration modal state
  const [showPhoneModal, setShowPhoneModal] = useState(false);

  useEffect(() => {
    loadAllAdminData();
  }, []);

  async function loadAllAdminData() {
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [usersRes, phonesRes, overviewRes] = await Promise.all([
        fetch('/api/admin/users', { headers }),
        fetch('/api/admin/phone-numbers', { headers }),
        fetch('/api/admin/overview', { headers })
      ]);

      const usersData = await usersRes.json();
      const phonesData = await phonesRes.json();
      const overviewData = await overviewRes.json();

      if (usersData.success) setUsers(usersData.data || []);
      if (phonesData.success) setPhoneNumbers(phonesData.data || []);
      if (overviewData.success) setOverview(overviewData.data || null);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  }

  function flashSuccess(msg) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  // User Actions
  async function handleToggleStatus(userId, currentStatus) {
    const newStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        flashSuccess(data.message);
        loadAllAdminData();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleToggleRole(userId, currentRole) {
    const newRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
    if (!confirm(`Are you sure you want to change this user's role to ${newRole}?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ role: newRole })
      });
      const data = await res.json();
      if (data.success) {
        flashSuccess(data.message);
        loadAllAdminData();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleAssignPhone(userId, phoneId) {
    try {
      const res = await fetch(`/api/admin/users/${userId}/assign-phone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ phoneId: phoneId || null })
      });
      const data = await res.json();
      if (data.success) {
        flashSuccess(data.message);
        loadAllAdminData();
      }
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleInspect(userId, userName) {
    if (confirm(`Switch view into ${userName}'s account? You can return to Master Admin at any time via the top banner.`)) {
      try {
        await impersonateUser(userId);
      } catch (err) {
        alert(err.message);
      }
    }
  }

  // Phone Actions
  async function handleSetDefaultPhone(id) {
    try {
      const res = await fetch(`/api/admin/phone-numbers/${id}/default`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        flashSuccess('Default phone line updated.');
        loadAllAdminData();
      }
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDeletePhone(id, displayName) {
    if (!confirm(`Are you sure you want to remove '${displayName}' from the platform?`)) return;
    try {
      const res = await fetch(`/api/admin/phone-numbers/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        flashSuccess(data.message);
        loadAllAdminData();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '28px 24px' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="badge badge-warning" style={{ fontSize: '0.75rem', padding: '3px 10px' }}>
              <ShieldCheck size={14} /> Master Admin Hub
            </span>
          </div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0F172A', marginTop: '6px', letterSpacing: '-0.02em' }}>
            Enterprise User Access & WABA Registry
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
            Central administration for User RBAC, Account Inspection, and WhatsApp Sender Number registration.
          </p>
        </div>

        <button
          onClick={loadAllAdminData}
          className="btn btn-secondary"
          style={{ gap: '8px' }}
        >
          <RefreshCw size={15} className={loading ? 'pulse-glow' : ''} />
          <span>Refresh Admin Data</span>
        </button>
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', marginBottom: '24px' }}>
        <button
          onClick={() => setActiveTab('users')}
          style={{
            padding: '10px 20px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'users' ? '2px solid var(--brand-wa)' : '2px solid transparent',
            color: activeTab === 'users' ? 'var(--brand-wa)' : '#64748B',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.9rem'
          }}
        >
          <Users size={16} /> User Management ({users.length})
        </button>

        <button
          onClick={() => setActiveTab('phones')}
          style={{
            padding: '10px 20px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'phones' ? '2px solid var(--brand-wa)' : '2px solid transparent',
            color: activeTab === 'phones' ? 'var(--brand-wa)' : '#64748B',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.9rem'
          }}
        >
          <Smartphone size={16} /> WhatsApp Lines ({phoneNumbers.length})
        </button>

        <button
          onClick={() => setActiveTab('overview')}
          style={{
            padding: '10px 20px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'overview' ? '2px solid var(--brand-wa)' : '2px solid transparent',
            color: activeTab === 'overview' ? 'var(--brand-wa)' : '#64748B',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.9rem'
          }}
        >
          <Activity size={16} /> System Health & Telemetry
        </button>
      </div>

      {/* TAB 1: USERS MANAGEMENT */}
      {activeTab === 'users' && (
        <div className="saas-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>
              Authorized Platform Accounts
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
              Admins can toggle account status, elevate roles, and inspect any user workspace.
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>User / Name</th>
                  <th>Contact Details</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Assigned Sender Number</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const isCurrent = u.id === currentUser?.id;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>
                          {u.name} {isCurrent && <span style={{ color: 'var(--brand-wa)', fontSize: '0.75rem' }}>(You)</span>}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                          ID: {u.id} • Joined: {new Date(u.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.85rem', color: '#334155' }}>{u.email}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{u.phone || 'No phone'}</div>
                      </td>
                      <td>
                        <button
                          onClick={() => handleToggleRole(u.id, u.role)}
                          disabled={isCurrent}
                          title={isCurrent ? "Cannot change own role" : "Click to toggle role"}
                          className={`badge ${u.role === 'ADMIN' ? 'badge-warning' : 'badge-neutral'}`}
                          style={{ cursor: isCurrent ? 'default' : 'pointer' }}
                        >
                          {u.role}
                        </button>
                      </td>
                      <td>
                        <button
                          onClick={() => handleToggleStatus(u.id, u.status)}
                          disabled={isCurrent}
                          className={`badge ${u.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}`}
                          style={{ cursor: isCurrent ? 'default' : 'pointer' }}
                        >
                          {u.status}
                        </button>
                      </td>
                      <td>
                        <select
                          value={u.assigned_phone_id || ''}
                          onChange={e => handleAssignPhone(u.id, e.target.value)}
                          className="saas-input"
                          style={{ padding: '5px 10px', fontSize: '0.8rem', width: 'auto' }}
                        >
                          <option value="">Default Primary Line</option>
                          {phoneNumbers.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.display_name} ({p.phone_number})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {!isCurrent && (
                          <button
                            onClick={() => handleInspect(u.id, u.name)}
                            className="btn btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '0.78rem', gap: '6px' }}
                          >
                            <Eye size={14} color="#D97706" />
                            <span>Inspect Account</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: REGISTERED WHATSAPP SENDER NUMBERS */}
      {activeTab === 'phones' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A' }}>
                WhatsApp Sender Lines (Meta WABA Registry)
              </h2>
              <p style={{ fontSize: '0.825rem', color: '#64748B' }}>
                Only Master Admins can register new WhatsApp sender lines. Regular operators broadcast through assigned numbers.
              </p>
            </div>

            <button
              onClick={() => setShowPhoneModal(true)}
              className="btn btn-action-green"
              style={{ gap: '8px' }}
            >
              <Plus size={16} />
              <span>Register New WhatsApp Number</span>
            </button>
          </div>

          {phoneNumbers.length === 0 ? (
            <div className="saas-card" style={{
              padding: '48px 24px',
              textAlign: 'center',
              border: '2px dashed #CBD5E1',
              background: '#F8FAFC'
            }}>
              <div style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: '#F0FDF4',
                color: '#16A34A',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '14px'
              }}>
                <Smartphone size={26} />
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                No WhatsApp Lines Registered
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#64748B', maxWidth: '460px', margin: '0 auto 20px auto' }}>
                Register your business phone line to enable broadcasts, automated booking lifecycle dispatches, and incoming webhook triggers.
              </p>
              <button
                onClick={() => setShowPhoneModal(true)}
                className="btn btn-action-green"
                style={{ gap: '8px', margin: '0 auto', padding: '9px 18px' }}
              >
                <Plus size={16} />
                <span>Register First WhatsApp Number</span>
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '18px' }}>
              {phoneNumbers.map(phone => (
              <div key={phone.id} className="saas-card" style={{ padding: '20px', position: 'relative' }}>
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
                    <Star size={11} fill="#15803D" /> PRIMARY LINE
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
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
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>{phone.display_name}</h3>
                    <div style={{ fontSize: '0.825rem', color: '#64748B', fontFamily: 'var(--font-mono)' }}>
                      {phone.phone_number}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
                  <span className="badge badge-success" style={{ fontSize: '0.675rem' }}>
                    Quality: {phone.quality_rating || 'GREEN'}
                  </span>
                  <span className="badge badge-info" style={{ fontSize: '0.675rem' }}>
                    Status: {phone.status || 'VERIFIED'}
                  </span>
                </div>

                <div style={{ background: '#F8FAFC', border: '1px solid var(--border-color)', padding: '10px', borderRadius: '8px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: '#64748B', marginBottom: '16px' }}>
                  <div>Phone ID: <span style={{ color: '#0F172A', fontWeight: 600 }}>{phone.phone_number_id}</span></div>
                  <div>WABA ID: <span style={{ color: '#0F172A', fontWeight: 600 }}>{phone.waba_id || 'System Shared'}</span></div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {!phone.is_default && (
                    <button
                      onClick={() => handleSetDefaultPhone(phone.id)}
                      className="btn btn-secondary"
                      style={{ flex: 1, padding: '7px 10px', fontSize: '0.8rem' }}
                    >
                      <Star size={14} /> Make Primary
                    </button>
                  )}
                  <button
                    onClick={() => handleDeletePhone(phone.id, phone.display_name)}
                    className="btn btn-danger"
                    style={{ padding: '7px 10px', fontSize: '0.8rem' }}
                    title="Delete Number"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SYSTEM TELEMETRY */}
      {activeTab === 'overview' && overview && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '18px' }}>
          <div className="saas-card" style={{ padding: '22px' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600 }}>Total Registered Users</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
              {overview.users?.total || 0}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#15803D', marginTop: '4px' }}>
              {overview.users?.active || 0} Active • {overview.users?.admins || 0} Master Admins
            </div>
          </div>

          <div className="saas-card" style={{ padding: '22px' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600 }}>Broadcast Campaigns</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
              {overview.campaigns?.total || 0}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#2563EB', marginTop: '4px' }}>
              {overview.campaigns?.completed || 0} Completed Dispatches
            </div>
          </div>

          <div className="saas-card" style={{ padding: '22px' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600 }}>WhatsApp Messages Sent</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#15803D', marginTop: '4px' }}>
              {overview.messages?.sent || 0}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
              {overview.messages?.delivered || 0} Delivered to Handsets
            </div>
          </div>

          <div className="saas-card" style={{ padding: '22px' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600 }}>Booking Automation Dispatches</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#D97706', marginTop: '4px' }}>
              {overview.automation?.totalAutomatedDispatches || 0}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
              Across 4 lifecycle stages
            </div>
          </div>
        </div>
      )}

      {/* REGISTER PHONE NUMBER MODAL */}
      <AddPhoneNumberModal
        isOpen={showPhoneModal}
        onClose={() => setShowPhoneModal(false)}
        onPhoneAdded={loadAllAdminData}
      />
    </div>
  );
}
