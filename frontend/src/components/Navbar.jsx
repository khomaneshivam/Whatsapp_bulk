import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Send, 
  Cpu, 
  MessageSquare, 
  BarChart3, 
  ShieldCheck, 
  Settings, 
  LogOut, 
  Smartphone,
  Activity,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab }) {
  const { user, isAdmin, isImpersonating, logout } = useAuth();
  const [metaStatus, setMetaStatus] = useState({ connected: false, loading: true });
  const [activeNumber, setActiveNumber] = useState(null);

  useEffect(() => {
    checkMetaHealth();
    fetchActiveNumber();
  }, []);

  async function checkMetaHealth() {
    try {
      const res = await fetch('/api/settings/verify-meta');
      const data = await res.json();
      setMetaStatus({ connected: Boolean(data.success), loading: false });
    } catch (err) {
      setMetaStatus({ connected: false, loading: false });
    }
  }

  async function fetchActiveNumber() {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/phone-numbers', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.data?.length > 0) {
        const defaultNum = data.data.find(n => n.is_default) || data.data[0];
        setActiveNumber(defaultNum);
      }
    } catch (err) {
      // Regular users or unauthenticated
    }
  }

  const navItems = [
    { id: 'broadcast', label: 'Broadcast', icon: Send },
    { id: 'automation', label: 'Automation', icon: Cpu },
    { id: 'inbox', label: '2-Way Inbox', icon: MessageSquare },
    { id: 'reports', label: 'Reports & Logs', icon: BarChart3 },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin Hub', icon: ShieldCheck, highlight: true }] : []),
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <header style={{
      background: 'rgba(10, 15, 20, 0.85)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--border-color)',
      padding: '0 24px',
      height: '70px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: isImpersonating ? '44px' : 0,
      zIndex: 900
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #25D366, #128C7E)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 14px rgba(37, 211, 102, 0.35)'
        }}>
          <Smartphone size={22} color="#ffffff" />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            KonkanTrip <span style={{ color: 'var(--emerald-primary)', fontWeight: 600, fontSize: '0.9rem' }}>BULK ENGINE</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            WhatsApp Cloud API & Lifecycle Automation
          </div>
        </div>
      </div>

      {/* Navigation tabs */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 600,
                border: '1px solid',
                borderColor: isActive ? 'rgba(16, 185, 129, 0.4)' : 'transparent',
                background: isActive 
                  ? 'rgba(16, 185, 129, 0.12)' 
                  : item.highlight ? 'rgba(245, 158, 11, 0.08)' : 'transparent',
                color: isActive 
                  ? 'var(--emerald-primary)' 
                  : item.highlight ? '#fbbf24' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseOver={e => {
                if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              }}
              onMouseOut={e => {
                if (!isActive) e.currentTarget.style.background = item.highlight ? 'rgba(245, 158, 11, 0.08)' : 'transparent';
              }}
            >
              <Icon size={16} />
              {item.label}
              {item.highlight && !isActive && (
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b' }} />
              )}
            </button>
          );
        })}
      </nav>

      {/* Right status & profile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Meta Connection Pill */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          padding: '5px 12px',
          borderRadius: '999px',
          background: metaStatus.connected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
          border: `1px solid ${metaStatus.connected ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)'}`,
          fontSize: '0.75rem',
          fontWeight: 600,
          color: metaStatus.connected ? '#34d399' : '#fb7185'
        }}>
          <span style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: metaStatus.connected ? '#10b981' : '#f43f5e',
            boxShadow: metaStatus.connected ? '0 0 8px #10b981' : 'none'
          }} />
          {metaStatus.loading ? 'Checking Meta...' : (metaStatus.connected ? 'Meta WABA Live' : 'Meta API Offline')}
        </div>

        {/* Sender Phone Chip */}
        {activeNumber && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 10px',
            borderRadius: '6px',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--border-color)',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)'
          }}>
            <Smartphone size={13} color="var(--emerald-primary)" />
            <span style={{ color: '#fff', fontWeight: 600 }}>{activeNumber.display_name}</span>
          </div>
        )}

        {/* User Card & Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>
              {user?.name || 'User'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
              <span className={`badge ${user?.role === 'ADMIN' ? 'badge-amber' : 'badge-emerald'}`} style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
                {user?.role === 'ADMIN' ? 'MASTER ADMIN' : 'AUTHORIZED AGENT'}
              </span>
            </div>
          </div>

          <button
            onClick={logout}
            title="Sign Out"
            style={{
              background: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.2)',
              color: '#fb7185',
              padding: '8px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(244, 63, 94, 0.2)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(244, 63, 94, 0.1)'}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
