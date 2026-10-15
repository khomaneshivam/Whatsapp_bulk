import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Eye, ArrowLeftCircle, ShieldAlert } from 'lucide-react';

export default function ImpersonationBanner() {
  const { isImpersonating, user, revertImpersonation } = useAuth();

  if (!isImpersonating) return null;

  return (
    <div style={{
      background: 'linear-gradient(90deg, #b45309, #d97706)',
      color: '#fff',
      padding: '10px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: '0.875rem',
      fontWeight: 500,
      boxShadow: '0 4px 12px rgba(217, 119, 6, 0.35)',
      position: 'sticky',
      top: 0,
      zIndex: 1000
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <ShieldAlert size={18} style={{ color: '#fef08a' }} />
        <span>
          <strong>ADMIN ACCOUNT INSPECTION ACTIVE:</strong> Currently viewing and managing the platform as{' '}
          <span style={{ textDecoration: 'underline', fontWeight: 700 }}>{user?.name}</span> ({user?.email}).
        </span>
      </div>

      <button
        onClick={revertImpersonation}
        style={{
          background: 'rgba(0, 0, 0, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          color: '#ffffff',
          padding: '6px 14px',
          borderRadius: '6px',
          cursor: 'pointer',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          transition: 'all 0.2s ease'
        }}
        onMouseOver={e => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)'}
        onMouseOut={e => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.4)'}
      >
        <ArrowLeftCircle size={16} />
        Exit Inspection & Return to Admin
      </button>
    </div>
  );
}
