import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return null;
  });
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('token')));
  const [originalAdminToken, setOriginalAdminToken] = useState(() => localStorage.getItem('orig_admin_token') || null);

  const isImpersonating = Boolean(originalAdminToken);

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    if (savedToken) {
      verifyAndFetchUser(savedToken);
    } else {
      setLoading(false);
    }
  }, []);

  async function verifyAndFetchUser(tok = token) {
    if (!tok) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${tok}`
        }
      });
      const data = await res.json();
      if (data.success && data.user) {
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
      } else {
        logout();
      }
    } catch (err) {
      if (!user) logout();
    } finally {
      setLoading(false);
    }
  }

  async function login(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Login failed');
    }
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    return data;
  }

  async function register(name, email, phone, password) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, password })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Registration failed');
    }
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    return data;
  }

  function logout() {
    setToken(null);
    setUser(null);
    setOriginalAdminToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('orig_admin_token');
  }

  // Admin account inspection / impersonation
  async function impersonateUser(targetUserId) {
    if (!user || user.role !== 'ADMIN') {
      throw new Error('Only Master Admins can inspect accounts.');
    }
    const currentAdminToken = token;
    const res = await fetch(`/api/admin/impersonate/${targetUserId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${currentAdminToken}` }
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to switch into target user account');
    }

    // Save admin token for reversion
    localStorage.setItem('orig_admin_token', currentAdminToken);
    setOriginalAdminToken(currentAdminToken);

    // Set impersonated user token
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    return data.user;
  }

  // Revert back to Master Admin account
  async function revertImpersonation() {
    if (!originalAdminToken) return;
    const adminTok = originalAdminToken;
    localStorage.removeItem('orig_admin_token');
    setOriginalAdminToken(null);

    setToken(adminTok);
    localStorage.setItem('token', adminTok);
    await verifyAndFetchUser(adminTok);
  }

  const value = {
    user,
    token,
    loading,
    isAuthenticated: Boolean(token && user),
    isAdmin: user?.role === 'ADMIN',
    isImpersonating,
    login,
    register,
    logout,
    impersonateUser,
    revertImpersonation,
    refreshUser: () => verifyAndFetchUser(token)
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
