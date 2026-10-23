import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import ImpersonationBanner from './components/ImpersonationBanner';
import DashboardPage from './pages/DashboardPage';
import BroadcastPage from './pages/BroadcastPage';
import FlowsPage from './pages/FlowsPage';
import AutomationPage from './pages/AutomationPage';
import InboxPage from './pages/InboxPage';
import ReportsPage from './pages/ReportsPage';
import AdminPage from './pages/AdminPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import { Smartphone } from 'lucide-react';

function AppContent() {
  const { isAuthenticated, loading, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authView, setAuthView] = useState('login'); // 'login' or 'register'

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        color: '#64748B',
        background: 'var(--bg-primary)'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          borderRadius: '14px',
          background: 'linear-gradient(135deg, #128C7E, #0d7064)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'pulseGlow 1.5s infinite',
          boxShadow: '0 4px 14px rgba(18, 140, 126, 0.3)'
        }}>
          <Smartphone size={26} color="#FFFFFF" />
        </div>
        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0F172A' }}>
          Initializing KonkanTrip Enterprise Engine...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (authView === 'register') {
      return <RegisterPage onSwitchToLogin={() => setAuthView('login')} />;
    }
    return <LoginPage onSwitchToRegister={() => setAuthView('register')} />;
  }


  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      <ImpersonationBanner />

      <div style={{ display: 'flex', flex: 1, minHeight: '100vh' }}>
        {/* Enterprise Sidebar */}
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          mobileOpen={mobileOpen} 
          setMobileOpen={setMobileOpen} 
        />

        {/* Main Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowX: 'hidden' }}>
          <Topbar 
            activeTab={activeTab} 
            setActiveTab={setActiveTab} 
            setMobileOpen={setMobileOpen} 
          />

          <main style={{ flex: 1, paddingBottom: '40px' }}>
            {activeTab === 'dashboard' && <DashboardPage setActiveTab={setActiveTab} />}
            {activeTab === 'broadcast' && <BroadcastPage />}
            {activeTab === 'flows' && <FlowsPage />}
            {activeTab === 'automation' && <AutomationPage />}
            {activeTab === 'inbox' && <InboxPage />}
            {activeTab === 'reports' && <ReportsPage />}
            {activeTab === 'admin' && isAdmin && <AdminPage />}
            {activeTab === 'settings' && <SettingsPage />}
          </main>

          <footer style={{
            borderTop: '1px solid var(--border-color)',
            padding: '16px 24px',
            textAlign: 'center',
            fontSize: '0.78rem',
            color: '#94A3B8',
            background: '#FFFFFF'
          }}>
            <div>
              KonkanTrip Official WhatsApp Cloud API Broadcasting & 4-Stage Booking Lifecycle Platform • Enterprise Secured RBAC
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
