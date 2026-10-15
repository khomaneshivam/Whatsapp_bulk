import React from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard,
  Send, 
  Cpu, 
  MessageSquare, 
  BarChart3, 
  ShieldCheck, 
  Settings, 
  Smartphone,
  ChevronRight,
  UserCheck
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, mobileOpen, setMobileOpen }) {
  const { user, isAdmin } = useAuth();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'broadcast', label: 'Broadcast Studio', icon: Send },
    { id: 'automation', label: 'Booking Lifecycle', icon: Cpu },
    { id: 'inbox', label: '2-Way Inbox', icon: MessageSquare },
    { id: 'reports', label: 'Delivery Reports', icon: BarChart3 },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin Hub', icon: ShieldCheck, badge: 'Admin' }] : []),
    { id: 'settings', label: 'Line & API Settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div 
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(4px)',
            zIndex: 998,
            display: 'block'
          }}
        />
      )}

      <aside style={{
        width: '260px',
        background: '#FFFFFF',
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
        zIndex: 999,
        transition: 'transform 0.25s ease',
        transform: mobileOpen ? 'translateX(0)' : undefined
      }}>
        {/* Brand Header */}
        <div style={{
          padding: '20px 20px 18px 20px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #128C7E, #0d7064)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            boxShadow: '0 2px 8px rgba(18, 140, 126, 0.3)',
            flexShrink: 0
          }}>
            <Smartphone size={20} strokeWidth={2.2} />
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{
              fontWeight: 800,
              fontSize: '1.05rem',
              color: '#0F172A',
              letterSpacing: '-0.02em',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              KonkanTrip
              <span style={{
                background: '#DCFCE7',
                color: '#15803D',
                fontSize: '0.65rem',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid #BBF7D0'
              }}>
                WABA
              </span>
            </div>
            <div style={{
              fontSize: '0.72rem',
              color: '#64748B',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              Enterprise WhatsApp Engine
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <div style={{ flex: 1, padding: '16px 12px', overflowY: 'auto' }}>
          <div style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#94A3B8',
            padding: '4px 12px 10px 12px'
          }}>
            Main Navigation
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    if (setMobileOpen) setMobileOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    fontWeight: isActive ? 600 : 500,
                    border: '1px solid',
                    borderColor: isActive ? '#BBF7D0' : 'transparent',
                    background: isActive ? '#F0FDF4' : 'transparent',
                    color: isActive ? '#15803D' : '#334155',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    textAlign: 'left'
                  }}
                  onMouseOver={e => {
                    if (!isActive) {
                      e.currentTarget.style.background = '#F8FAFC';
                      e.currentTarget.style.color = '#0F172A';
                    }
                  }}
                  onMouseOut={e => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#334155';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Icon size={18} color={isActive ? '#16A34A' : '#64748B'} />
                    <span>{item.label}</span>
                  </div>

                  {item.badge ? (
                    <span style={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      background: '#FEF3C7',
                      color: '#B45309',
                      padding: '2px 7px',
                      borderRadius: '999px',
                      border: '1px solid #FDE68A'
                    }}>
                      {item.badge}
                    </span>
                  ) : isActive ? (
                    <ChevronRight size={14} color="#16A34A" />
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Profile & Sign Out Footer */}
        <div style={{
          padding: '14px 16px',
          borderTop: '1px solid var(--border-color)',
          background: '#F8FAFC',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              background: user?.role === 'ADMIN' ? '#FEF3C7' : '#DCFCE7',
              border: `1px solid ${user?.role === 'ADMIN' ? '#FDE68A' : '#BBF7D0'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: user?.role === 'ADMIN' ? '#B45309' : '#15803D',
              flexShrink: 0
            }}>
              <UserCheck size={18} />
            </div>
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <div style={{
                fontSize: '0.825rem',
                fontWeight: 700,
                color: '#0F172A',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {user?.name || 'Authorized User'}
              </div>
              <div style={{
                fontSize: '0.7rem',
                color: user?.role === 'ADMIN' ? '#D97706' : '#64748B',
                fontWeight: 600
              }}>
                {user?.role === 'ADMIN' ? 'Master Admin' : 'Agent Operator'}
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            background: '#DCFCE7',
            padding: '4px 8px',
            borderRadius: '999px',
            border: '1px solid #BBF7D0'
          }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#16A34A',
              boxShadow: '0 0 5px rgba(22, 163, 74, 0.6)'
            }} />
            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#15803D' }}>
              Active
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
