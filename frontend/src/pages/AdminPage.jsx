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
  RefreshCw,
  Key,
  Archive,
  Lock,
  AlertCircle
} from 'lucide-react';
import AddPhoneNumberModal from '../components/AddPhoneNumberModal';
import { formatIndianDate } from '../utils/indianTime';

export default function AdminPage() {
  const { token, user: currentUser, impersonateUser } = useAuth();
  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'phones' | 'overview'
  const [users, setUsers] = useState([]);
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [overview, setOverview] = useState(null);
  const [unassignedSummary, setUnassignedSummary] = useState(null);
  const [claimingHistory, setClaimingHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState(null);

  // Phone registration modal state
  const [showPhoneModal, setShowPhoneModal] = useState(false);

  // Admin Reset Password modal state
  const [resetPasswordModal, setResetPasswordModal] = useState({
    open: false,
    user: null,
    newPassword: '',
    loading: false,
    error: null
  });

  useEffect(() => {
    loadAllAdminData();
  }, []);

  async function loadAllAdminData() {
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [usersRes, phonesRes, overviewRes, unassignedRes] = await Promise.all([
        fetch('/api/admin/users', { headers }),
        fetch('/api/admin/phone-numbers', { headers }),
        fetch('/api/admin/overview', { headers }),
        fetch('/api/admin/unassigned-summary', { headers }).catch(() => null)
      ]);

      const usersData = await usersRes.json();
      const phonesData = await phonesRes.json();
      const overviewData = await overviewRes.json();
      const unassignedData = unassignedRes ? await unassignedRes.json() : null;

      if (usersData.success) setUsers(usersData.data || []);
      if (phonesData.success) setPhoneNumbers(phonesData.data || []);
      if (overviewData.success) setOverview(overviewData.data || null);
      if (unassignedData?.success) setUnassignedSummary(unassignedData.data);
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

  // Claim unassigned legacy history for a specific user
  async function handleClaimHistory(userId, userName) {
    if (!confirm(`Are you sure you want to assign all unassigned legacy broadcast campaigns and replies to ${userName}?`)) return;
    setClaimingHistory(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/claim-history`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to claim legacy data.');
      }
      flashSuccess(data.message);
      loadAllAdminData();
    } catch (err) {
      alert(err.message);
    } finally {
      setClaimingHistory(false);
    }
  }

  // Admin password reset modal handlers
  function handleOpenResetPassword(user) {
    setResetPasswordModal({
      open: true,
      user,
      newPassword: '',
      loading: false,
      error: null
    });
  }

  function handleGenerateRandomPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let pwd = '';
    for (let i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setResetPasswordModal(prev => ({ ...prev, newPassword: pwd }));
  }

  async function handleSubmitAdminResetPassword(e) {
    e.preventDefault();
    const { user, newPassword } = resetPasswordModal;
    if (!newPassword || newPassword.length < 8) {
      setResetPasswordModal(prev => ({ ...prev, error: 'Password must be at least 8 characters long.' }));
      return;
    }

    setResetPasswordModal(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ newPassword })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to reset user password.');
      }
      flashSuccess(data.message);
      setResetPasswordModal({ open: false, user: null, newPassword: '', loading: false, error: null });
    } catch (err) {
      setResetPasswordModal(prev => ({ ...prev, error: err.message, loading: false }));
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

      {/* Unassigned Legacy History Alert Banner */}
      {unassignedSummary?.hasUnassigned && (
        <div style={{
          background: 'linear-gradient(90deg, #FEF3C7, #FFFBEB)',
          border: '1px solid #FCD34D',
          borderRadius: '10px',
          padding: '14px 18px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
          flexWrap: 'wrap',
          boxShadow: '0 2px 8px rgba(217, 119, 6, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: '#FDE68A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#B45309'
            }}>
              <Archive size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#92400E' }}>
                Unassigned Legacy Broadcast Campaigns Detected ({unassignedSummary.unassignedCampaigns} Campaigns, {unassignedSummary.unassignedReplies} Replies)
              </div>
              <div style={{ fontSize: '0.8rem', color: '#B45309', marginTop: '2px' }}>
                These records were created prior to user accounts. You can link them all to your master administrator profile with one click.
              </div>
            </div>
          </div>
          <button
            onClick={() => handleClaimHistory(currentUser?.id, currentUser?.name || 'Administrator')}
            disabled={claimingHistory}
            className="btn btn-action-green"
            style={{ padding: '8px 16px', fontSize: '0.825rem', gap: '6px' }}
          >
            <Archive size={15} />
            <span>{claimingHistory ? 'Linking Records...' : 'Claim All History to My Account'}</span>
          </button>
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
                          ID: {u.id} • Joined: {formatIndianDate(u.created_at)}
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
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            onClick={() => handleOpenResetPassword(u)}
                            title="Reset User Password"
                            className="btn btn-secondary"
                            style={{ padding: '6px 10px', fontSize: '0.78rem', gap: '5px' }}
                          >
                            <Key size={13} color="#D97706" />
                            <span>Reset Pwd</span>
                          </button>

                          {unassignedSummary?.hasUnassigned && (
                            <button
                              onClick={() => handleClaimHistory(u.id, u.name)}
                              disabled={claimingHistory}
                              title="Assign all unassigned legacy broadcast data to this user"
                              className="btn btn-secondary"
                              style={{ padding: '6px 10px', fontSize: '0.78rem', gap: '5px' }}
                            >
                              <Archive size={13} color="#059669" />
                              <span>Assign Data</span>
                            </button>
                          )}

                          {!isCurrent && (
                            <button
                              onClick={() => handleInspect(u.id, u.name)}
                              className="btn btn-secondary"
                              style={{ padding: '6px 10px', fontSize: '0.78rem', gap: '5px' }}
                            >
                              <Eye size={13} color="#2563EB" />
                              <span>Inspect</span>
                            </button>
                          )}
                        </div>
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

      {/* ADMIN RESET USER PASSWORD MODAL */}
      {resetPasswordModal.open && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 9999,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div className="saas-card" style={{
            width: '100%',
            maxWidth: '440px',
            padding: '28px',
            boxShadow: 'var(--shadow-xl)',
            border: '1px solid var(--border-color)',
            position: 'relative'
          }}>
            <button
              onClick={() => setResetPasswordModal({ open: false, user: null, newPassword: '', loading: false, error: null })}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'transparent',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                padding: '4px'
              }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#FEF3C7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#D97706'
              }}>
                <Key size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Reset User Password
                </h3>
                <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                  Set a new security password for {resetPasswordModal.user?.name}
                </span>
              </div>
            </div>

            {resetPasswordModal.error && (
              <div style={{
                background: '#FEE2E2',
                border: '1px solid #FECACA',
                borderRadius: '8px',
                padding: '10px 14px',
                color: '#DC2626',
                fontSize: '0.8rem',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '16px'
              }}>
                <AlertCircle size={16} />
                <span>{resetPasswordModal.error}</span>
              </div>
            )}

            <form onSubmit={handleSubmitAdminResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Target User Account
                </label>
                <div style={{
                  padding: '9px 12px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.85rem',
                  color: '#1E293B',
                  fontWeight: 600
                }}>
                  {resetPasswordModal.user?.name} ({resetPasswordModal.user?.email})
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                    New Password (min. 8 characters)
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateRandomPassword}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--brand-wa)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    Generate Random
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    required
                    className="saas-input"
                    placeholder="Enter new password"
                    value={resetPasswordModal.newPassword}
                    onChange={e => setResetPasswordModal(prev => ({ ...prev, newPassword: e.target.value }))}
                    style={{ paddingLeft: '38px', fontFamily: 'monospace', fontWeight: 600 }}
                  />
                  <Lock size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setResetPasswordModal({ open: false, user: null, newPassword: '', loading: false, error: null })}
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '10px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetPasswordModal.loading}
                  className="btn btn-action-green"
                  style={{ flex: 1.5, padding: '10px' }}
                >
                  {resetPasswordModal.loading ? 'Saving...' : 'Set New Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
