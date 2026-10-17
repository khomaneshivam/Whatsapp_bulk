import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Download, 
  FileSpreadsheet, 
  Clock, 
  Layers,
  Search,
  FolderOpen,
  Users,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
  StopCircle,
  Trash2,
  Calendar,
  AlertTriangle,
  CheckCheck,
  MessageSquare
} from 'lucide-react';

export default function ReportsPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('campaigns'); // 'campaigns' | 'recipients' | 'automation'
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [pastCampaigns, setPastCampaigns] = useState([]);
  const [campaignReports, setCampaignReports] = useState([]);
  const [automationReports, setAutomationReports] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedCampaignId, setSelectedCampaignId] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadReportsData();
  }, [selectedStatus, selectedCampaignId]);

  async function loadReportsData() {
    setLoading(true);
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      // 1. Overview stats
      try {
        const overRes = await fetch('/api/reports/overview', { headers });
        const overData = await overRes.json();
        if (overData.success) setOverview(overData.data);
      } catch (e) {
        console.warn('Overview stats fetch note:', e.message);
      }

      // 2. Past Broadcast Campaigns list
      try {
        const campListRes = await fetch('/api/campaigns', { headers });
        const campListData = await campListRes.json();
        if (campListData.success && Array.isArray(campListData.data)) {
          setPastCampaigns(campListData.data);
        }
      } catch (e) {
        console.warn('Campaigns list fetch note:', e.message);
      }

      // 3. Campaign recipient logs
      try {
        const params = new URLSearchParams();
        if (selectedStatus !== 'ALL') params.append('status', selectedStatus);
        if (selectedCampaignId !== 'ALL') params.append('campaignId', selectedCampaignId);
        
        const url = `/api/reports/campaigns${params.toString() ? `?${params.toString()}` : ''}`;
        const campRes = await fetch(url, { headers });
        const campData = await campRes.json();
        if (campData.success) setCampaignReports(campData.data || []);
      } catch (e) {
        console.warn('Recipient logs fetch note:', e.message);
      }

      // 4. Automation dispatches
      try {
        const autoRes = await fetch('/api/reports/automation', { headers });
        const autoData = await autoRes.json();
        if (autoData.success) setAutomationReports(autoData.data || []);
      } catch (e) {
        console.warn('Automation logs fetch note:', e.message);
      }
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleExport(format, campaignId = null) {
    const params = new URLSearchParams();
    params.append('format', format);
    if (campaignId && campaignId !== 'ALL') params.append('campaignId', campaignId);
    else if (selectedCampaignId !== 'ALL') params.append('campaignId', selectedCampaignId);

    const exportUrl = `/api/reports/campaigns/export?${params.toString()}`;
    fetch(exportUrl, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    })
      .then(res => {
        if (!res.ok) throw new Error('Export download failed');
        return res.blob();
      })
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `whatsapp_delivery_audit_${Date.now()}.${format === 'csv' ? 'csv' : 'xlsx'}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch(err => alert('Export failed: ' + err.message));
  }

  function handleViewCampaignRecipients(campId) {
    setSelectedCampaignId(campId);
    setActiveTab('recipients');
  }

  // Cancel scheduled or running campaign
  async function handleCancelCampaign(campId, campName) {
    if (!window.confirm(`Are you sure you want to cancel the campaign "${campName}"?`)) {
      return;
    }
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`/api/campaigns/${campId}/cancel`, {
        method: 'POST',
        headers
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to cancel campaign');
      }
      alert(`✓ Campaign "${campName}" was cancelled.`);
      loadReportsData();
    } catch (err) {
      alert(`Error cancelling campaign: ${err.message}`);
    }
  }

  // Trigger scheduled campaign immediately
  async function handleRunNow(campId, campName) {
    if (!window.confirm(`Launch scheduled campaign "${campName}" immediately right now?`)) {
      return;
    }
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`/api/campaigns/${campId}/run-now`, {
        method: 'POST',
        headers
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to trigger campaign');
      }
      alert(`🚀 Campaign "${campName}" has been triggered! Refreshing live status...`);
      loadReportsData();
    } catch (err) {
      alert(`Error starting campaign: ${err.message}`);
    }
  }

  // Pause running broadcast
  async function handlePauseCampaign(campId, campName) {
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`/api/campaigns/${campId}/pause`, {
        method: 'POST',
        headers
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to pause campaign');
      loadReportsData();
    } catch (err) {
      alert(`Error pausing campaign: ${err.message}`);
    }
  }

  // Resume paused broadcast
  async function handleResumeCampaign(campId, campName) {
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`/api/campaigns/${campId}/resume`, {
        method: 'POST',
        headers
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to resume campaign');
      loadReportsData();
    } catch (err) {
      alert(`Error resuming campaign: ${err.message}`);
    }
  }

  // Delete campaign and its recipient audit rows
  async function handleDeleteCampaign(campId, campName) {
    if (!window.confirm(`Are you sure you want to permanently delete campaign "${campName}" and all its logs?`)) {
      return;
    }
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`/api/campaigns/${campId}`, {
        method: 'DELETE',
        headers
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to delete campaign');
      }
      setPastCampaigns(prev => prev.filter(c => c.id !== campId));
      if (selectedCampaignId === campId) setSelectedCampaignId('ALL');
    } catch (err) {
      alert(`Error deleting campaign: ${err.message}`);
    }
  }

  const filteredCampaignReports = campaignReports.filter(r => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = (r.contact_name || r.recipient_name || '').toLowerCase();
    const phone = (r.phone_number || r.clean_phone || '');
    const cName = (r.campaign_name || '').toLowerCase();
    const metaId = (r.meta_message_id || '').toLowerCase();
    return name.includes(q) || phone.includes(q) || cName.includes(q) || metaId.includes(q);
  });

  const filteredPastCampaigns = pastCampaigns.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = (c.name || '').toLowerCase();
    const tpl = (c.template_name || '').toLowerCase();
    const file = (c.file_name || '').toLowerCase();
    return name.includes(q) || tpl.includes(q) || file.includes(q);
  });

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '28px 24px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
            Analytics & Delivery Audit Reports
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
            Past campaign history, audited recipient delivery logs, Meta handshake diagnostics, and 1-click Excel/CSV exports.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => handleExport('csv')}
            className="btn btn-secondary"
            style={{ gap: '8px' }}
          >
            <Download size={15} />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => handleExport('xlsx')}
            className="btn btn-primary"
            style={{ gap: '8px' }}
          >
            <FileSpreadsheet size={15} />
            <span>Export Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      {overview && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
          <div className="saas-card" style={{ padding: '20px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Broadcasts</div>
            <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0F172A', marginTop: '6px' }}>
              {overview.totalBroadcasts || pastCampaigns.length || 0}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
              {overview.activeScheduled || 0} scheduled queue
            </div>
          </div>

          <div className="saas-card" style={{ padding: '20px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Targeted Audience</div>
            <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#2563EB', marginTop: '6px' }}>
              {(overview.totalRecipients || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
              {(overview.totalSent || 0).toLocaleString()} dispatched
            </div>
          </div>

          <div className="saas-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Delivered Rate</div>
              <span className="badge" style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #BBF7D0', fontSize: '0.7rem' }}>
                {overview.deliveryRate || '100%'}
              </span>
            </div>
            <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#15803D', marginTop: '6px' }}>
              {(overview.totalDelivered || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#15803D', marginTop: '4px' }}>
              Handset delivered verified
            </div>
          </div>

          <div className="saas-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Read Receipts</div>
              <span className="badge" style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', fontSize: '0.7rem' }}>
                {overview.readRate || '0%'}
              </span>
            </div>
            <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#2563EB', marginTop: '6px' }}>
              {(overview.totalRead || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
              Blue double ticks read
            </div>
          </div>

          <div className="saas-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Customer Replies</div>
              <span className="badge" style={{ background: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE', fontSize: '0.7rem' }}>
                {overview.replyRate || '0%'}
              </span>
            </div>
            <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#7C3AED', marginTop: '6px' }}>
              {(overview.totalReplies || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
              2-way inbox responses
            </div>
          </div>

          <div className="saas-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Delivery Failures</div>
              <span className="badge" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', fontSize: '0.7rem' }}>
                {overview.failureRate || '0%'}
              </span>
            </div>
            <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#DC2626', marginTop: '6px' }}>
              {(overview.totalFailed || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#DC2626', marginTop: '4px' }}>
              Invalid / Blocked numbers
            </div>
          </div>
        </div>
      )}

      {/* Tabs & Filter Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-color)',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('campaigns')}
            style={{
              padding: '10px 18px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'campaigns' ? '2px solid var(--brand-wa)' : '2px solid transparent',
              color: activeTab === 'campaigns' ? 'var(--brand-wa)' : '#64748B',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.9rem'
            }}
          >
            <FolderOpen size={16} /> Past Broadcast Campaigns ({pastCampaigns.length})
          </button>

          <button
            onClick={() => setActiveTab('recipients')}
            style={{
              padding: '10px 18px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'recipients' ? '2px solid var(--brand-wa)' : '2px solid transparent',
              color: activeTab === 'recipients' ? 'var(--brand-wa)' : '#64748B',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.9rem'
            }}
          >
            <Users size={16} /> Recipient Audit Logs ({filteredCampaignReports.length})
          </button>

          <button
            onClick={() => setActiveTab('automation')}
            style={{
              padding: '10px 18px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'automation' ? '2px solid var(--brand-wa)' : '2px solid transparent',
              color: activeTab === 'automation' ? 'var(--brand-wa)' : '#64748B',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.9rem'
            }}
          >
            <Clock size={16} /> Booking Automations ({automationReports.length})
          </button>
        </div>

        {/* Search & Status Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '8px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder={activeTab === 'campaigns' ? 'Search campaign name or template...' : 'Search recipient name, phone, wamid...'}
              className="saas-input"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '260px', paddingLeft: '32px', fontSize: '0.825rem', padding: '7px 10px 7px 32px' }}
            />
            <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
          </div>

          {activeTab === 'recipients' && (
            <>
              {pastCampaigns.length > 0 && (
                <select
                  value={selectedCampaignId}
                  onChange={e => setSelectedCampaignId(e.target.value)}
                  className="saas-input"
                  style={{ width: 'auto', maxWidth: '200px', fontSize: '0.825rem', padding: '7px 12px' }}
                >
                  <option value="ALL">All Campaigns</option>
                  {pastCampaigns.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}

              <select
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                className="saas-input"
                style={{ width: 'auto', fontSize: '0.825rem', padding: '7px 12px' }}
              >
                <option value="ALL">All Statuses</option>
                <option value="SENT">Sent</option>
                <option value="DELIVERED">Delivered</option>
                <option value="READ">Read</option>
                <option value="FAILED">Failed</option>
              </select>
            </>
          )}

          <button
            onClick={loadReportsData}
            className="btn btn-secondary"
            title="Refresh reports"
            style={{ padding: '7px 10px' }}
          >
            <RefreshCw size={14} className={loading ? 'pulse-glow' : ''} />
          </button>
        </div>
      </div>

      {/* TAB 1: PAST BROADCAST CAMPAIGNS TABLE */}
      {activeTab === 'campaigns' && (
        <div>
          {pastCampaigns.filter(c => c.status === 'SCHEDULED').length > 0 && (
            <div style={{
              background: '#F5F3FF',
              border: '1px solid #DDD6FE',
              borderRadius: '10px',
              padding: '14px 18px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Clock size={20} color="#7C3AED" />
                <div>
                  <div style={{ fontWeight: 800, color: '#5B21B6', fontSize: '0.875rem' }}>
                    {pastCampaigns.filter(c => c.status === 'SCHEDULED').length} Broadcast Campaign(s) Scheduled in Queue
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#6D28D9', marginTop: '2px' }}>
                    Waiting for scheduled dispatch time. You can dispatch them immediately with "Run Now" or cancel them before launch.
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSearchQuery('scheduled')}
                className="btn btn-secondary"
                style={{ fontSize: '0.75rem', padding: '6px 14px', background: '#FFFFFF', borderColor: '#DDD6FE', color: '#6D28D9', fontWeight: 700 }}
              >
                View Scheduled Only
              </button>
            </div>
          )}

          <div className="saas-card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', maxHeight: '600px' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Campaign Name</th>
                    <th>Source File</th>
                    <th>Template Name</th>
                    <th>Total Targets</th>
                    <th>Dispatched</th>
                    <th>Failed</th>
                    <th>Status</th>
                    <th>Schedule / Execution Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && pastCampaigns.length === 0 ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: '#64748B' }}>
                        <RefreshCw size={20} className="pulse-glow" style={{ margin: '0 auto 8px auto' }} />
                        <div>Loading past campaign reports...</div>
                      </td>
                    </tr>
                  ) : filteredPastCampaigns.length === 0 ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: '#94A3B8' }}>
                        No broadcast campaigns found matching current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredPastCampaigns.map(camp => (
                      <tr key={camp.id}>
                        <td>
                          <div style={{ fontWeight: 700, color: '#0F172A' }}>{camp.name}</div>
                          <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontFamily: 'var(--font-mono)' }}>
                            ID: {camp.id}
                          </div>
                        </td>
                        <td style={{ fontSize: '0.78rem', color: '#475569' }}>
                          {camp.file_name || 'contacts.xlsx'}
                        </td>
                        <td>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', background: '#F1F5F9', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                            {camp.template_name || 'Template'}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700 }}>
                          {camp.valid_contacts || camp.total_contacts || 0}
                        </td>
                        <td style={{ fontWeight: 700, color: '#16A34A' }}>
                          {camp.sent_count || 0}
                        </td>
                        <td style={{ fontWeight: 700, color: camp.failed_count > 0 ? '#DC2626' : '#94A3B8' }}>
                          {camp.failed_count || 0}
                        </td>
                        <td>
                          {camp.status === 'SCHEDULED' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <span className="badge" style={{ background: '#EDE9FE', color: '#6D28D9', border: '1px solid #DDD6FE', fontWeight: 800, fontSize: '0.72rem' }}>
                                ⏰ SCHEDULED
                              </span>
                              {camp.scheduled_at && (
                                <span style={{ fontSize: '0.68rem', color: '#6D28D9', fontWeight: 600 }}>
                                  {new Date(camp.scheduled_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                          ) : camp.status === 'RUNNING' ? (
                            <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <span className="pulse-glow" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2563EB' }} />
                              RUNNING
                            </span>
                          ) : camp.status === 'PAUSED' ? (
                            <span className="badge" style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A', fontWeight: 700 }}>
                              ⏸ PAUSED
                            </span>
                          ) : camp.status === 'CANCELLED' ? (
                            <span className="badge" style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid #CBD5E1', fontWeight: 700 }}>
                              🛑 CANCELLED
                            </span>
                          ) : camp.status === 'FAILED' ? (
                            <span className="badge badge-danger">
                              ✕ FAILED
                            </span>
                          ) : (
                            <span className="badge badge-success">
                              ✓ {camp.status || 'COMPLETED'}
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.75rem', color: '#64748B' }}>
                          {camp.scheduled_at ? (
                            <div>
                              <div style={{ fontWeight: 600, color: '#0F172A' }}>{new Date(camp.scheduled_at).toLocaleString()}</div>
                              <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Created: {new Date(camp.created_at).toLocaleDateString()}</div>
                            </div>
                          ) : (
                            camp.created_at ? new Date(camp.created_at).toLocaleString() : 'N/A'
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap' }}>
                            {/* SCHEDULED CAMPAIGN ACTIONS */}
                            {camp.status === 'SCHEDULED' && (
                              <>
                                <button
                                  onClick={() => handleRunNow(camp.id, camp.name)}
                                  className="btn"
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '0.72rem',
                                    gap: '4px',
                                    background: '#DCFCE7',
                                    color: '#15803D',
                                    border: '1px solid #86EFAC',
                                    fontWeight: 700
                                  }}
                                  title="Run this scheduled campaign immediately"
                                >
                                  <Play size={12} />
                                  <span>Run Now</span>
                                </button>
                                <button
                                  onClick={() => handleCancelCampaign(camp.id, camp.name)}
                                  className="btn"
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '0.72rem',
                                    gap: '4px',
                                    background: '#FEE2E2',
                                    color: '#DC2626',
                                    border: '1px solid #FCA5A5',
                                    fontWeight: 700
                                  }}
                                  title="Cancel this scheduled broadcast"
                                >
                                  <StopCircle size={12} />
                                  <span>Cancel</span>
                                </button>
                              </>
                            )}

                            {/* RUNNING CAMPAIGN ACTIONS */}
                            {camp.status === 'RUNNING' && (
                              <>
                                <button
                                  onClick={() => handlePauseCampaign(camp.id, camp.name)}
                                  className="btn btn-secondary"
                                  style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px' }}
                                  title="Pause broadcast"
                                >
                                  <Pause size={12} color="#D97706" />
                                  <span>Pause</span>
                                </button>
                                <button
                                  onClick={() => handleCancelCampaign(camp.id, camp.name)}
                                  className="btn btn-danger"
                                  style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px' }}
                                  title="Stop and cancel ongoing broadcast"
                                >
                                  <StopCircle size={12} />
                                  <span>Stop</span>
                                </button>
                              </>
                            )}

                            {/* PAUSED CAMPAIGN ACTIONS */}
                            {camp.status === 'PAUSED' && (
                              <>
                                <button
                                  onClick={() => handleResumeCampaign(camp.id, camp.name)}
                                  className="btn btn-secondary"
                                  style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px' }}
                                  title="Resume broadcast"
                                >
                                  <Play size={12} color="#16A34A" />
                                  <span>Resume</span>
                                </button>
                                <button
                                  onClick={() => handleCancelCampaign(camp.id, camp.name)}
                                  className="btn btn-danger"
                                  style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px' }}
                                  title="Cancel paused broadcast"
                                >
                                  <StopCircle size={12} />
                                  <span>Cancel</span>
                                </button>
                              </>
                            )}

                            {/* RECIPIENTS AUDIT */}
                            <button
                              onClick={() => handleViewCampaignRecipients(camp.id)}
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px' }}
                              title="View individual recipient logs"
                            >
                              <Users size={12} />
                              <span>Recipients</span>
                            </button>

                            {/* EXPORT DATA */}
                            <button
                              onClick={() => handleExport('xlsx', camp.id)}
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px' }}
                              title="Export campaign to Excel"
                            >
                              <Download size={12} />
                              <span>Export</span>
                            </button>

                            {/* DELETE CAMPAIGN */}
                            {camp.id !== 'campaign_booking_lifecycle' && (
                              <button
                                onClick={() => handleDeleteCampaign(camp.id, camp.name)}
                                className="btn btn-secondary"
                                style={{ padding: '4px 6px', fontSize: '0.72rem', color: '#94A3B8' }}
                                title="Delete campaign record"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RECIPIENT AUDIT LOGS TABLE */}
      {activeTab === 'recipients' && (
        <div className="saas-card" style={{ overflow: 'hidden' }}>
          {selectedCampaignId !== 'ALL' && (
            <div style={{ padding: '12px 16px', background: '#F0FDF4', borderBottom: '1px solid #BBF7D0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '0.8rem', color: '#15803D', fontWeight: 600 }}>
                Filtering logs for campaign: <strong>{pastCampaigns.find(c => c.id === selectedCampaignId)?.name || selectedCampaignId}</strong>
              </div>
              <button
                onClick={() => setSelectedCampaignId('ALL')}
                style={{ border: 'none', background: 'transparent', color: '#15803D', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}
              >
                ✕ Clear Filter (Show All)
              </button>
            </div>
          )}

          <div style={{ overflowX: 'auto', maxHeight: '560px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Recipient Name</th>
                  <th>Phone Number</th>
                  <th>Campaign & Template</th>
                  <th>Delivery Status</th>
                  <th>Delivered At</th>
                  <th>Read At</th>
                  <th>Dispatched At</th>
                  <th>Meta Message ID</th>
                  <th>Error Diagnostic</th>
                </tr>
              </thead>
              <tbody>
                {filteredCampaignReports.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: '#94A3B8' }}>
                      No recipient delivery logs matching current filter.
                    </td>
                  </tr>
                ) : (
                  filteredCampaignReports.map((item, idx) => {
                    const recipientName = item.contact_name || item.recipient_name || 'Guest';
                    const rawStatus = (item.status || item.delivery_status || 'SENT').toUpperCase();
                    const sentTime = item.sent_at || item.dispatched_at;
                    const deliveredTime = item.delivered_at;
                    const readTime = item.read_at;

                    return (
                      <tr key={item.id || idx}>
                        <td style={{ fontWeight: 700, color: '#0F172A' }}>
                          {recipientName}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.825rem' }}>
                          +{item.clean_phone || item.phone_number}
                        </td>
                        <td>
                          <div style={{ color: '#0F172A', fontWeight: 600, fontSize: '0.825rem' }}>
                            {item.campaign_name || 'Campaign'}
                          </div>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', background: '#F1F5F9', padding: '1px 6px', borderRadius: '4px', color: '#64748B' }}>
                            {item.template_name || 'Template'}
                          </span>
                        </td>
                        <td>
                          {rawStatus === 'READ' ? (
                            <span className="badge" style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                              <CheckCheck size={13} color="#2563EB" /> READ
                            </span>
                          ) : rawStatus === 'DELIVERED' ? (
                            <span className="badge" style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                              <CheckCheck size={13} color="#15803D" /> DELIVERED
                            </span>
                          ) : rawStatus === 'SENT' ? (
                            <span className="badge badge-warning" style={{ fontWeight: 700 }}>
                              DISPATCHED
                            </span>
                          ) : rawStatus === 'PENDING' ? (
                            <span className="badge" style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0', fontWeight: 700 }}>
                              PENDING
                            </span>
                          ) : (
                            <span className="badge badge-danger" style={{ fontWeight: 700 }}>
                              ✕ FAILED
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.75rem', color: deliveredTime ? '#15803D' : '#94A3B8', fontWeight: deliveredTime ? 600 : 400 }}>
                          {deliveredTime ? new Date(deliveredTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                        </td>
                        <td style={{ fontSize: '0.75rem', color: readTime ? '#2563EB' : '#94A3B8', fontWeight: readTime ? 700 : 400 }}>
                          {readTime ? new Date(readTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                        </td>
                        <td style={{ fontSize: '0.75rem', color: '#64748B' }}>
                          {sentTime ? new Date(sentTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#64748B', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.meta_message_id || ''}>
                          {item.meta_message_id || '—'}
                        </td>
                        <td>
                          {item.error_message || item.error_code ? (
                            <div style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${item.error_code ? `[Code ${item.error_code}] ` : ''}${item.error_message || item.error_reason || ''}`}>
                              {item.error_code && (
                                <span className="badge" style={{ background: '#FEE2E2', color: '#DC2626', fontSize: '0.65rem', padding: '1px 5px', marginRight: '4px' }}>
                                  #{item.error_code}
                                </span>
                              )}
                              <span style={{ color: '#DC2626', fontSize: '0.75rem' }}>
                                {item.error_message || item.error_reason}
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: '#94A3B8', fontSize: '0.75rem' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: AUTOMATION LIFECYCLE AUDIT TABLE */}
      {activeTab === 'automation' && (
        <div className="saas-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', maxHeight: '560px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Guest / Booking</th>
                  <th>Customer Contact</th>
                  <th>Property Name</th>
                  <th>Check-in / Check-out</th>
                  <th>Lifecycle Stage</th>
                  <th>Template Dispatched</th>
                  <th>Status</th>
                  <th>Execution Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {automationReports.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: '#94A3B8' }}>
                      No automated lifecycle dispatches recorded yet.
                    </td>
                  </tr>
                ) : (
                  automationReports.map((item, idx) => (
                    <tr key={item.id || idx}>
                      <td>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{item.guest_name || item.customer_name || 'Guest'}</div>
                        <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontFamily: 'var(--font-mono)' }}>
                          {item.booking_id || `KT-AUTO-${idx + 1}`}
                        </div>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.825rem' }}>
                        {item.clean_phone || item.phone_number}
                      </td>
                      <td style={{ fontWeight: 600, color: '#334155' }}>
                        {item.property_name || 'KonkanTrip Beach Resort'}
                      </td>
                      <td style={{ fontSize: '0.75rem', color: '#64748B' }}>
                        {item.checkin_date || '—'} → {item.checkout_date || '—'}
                      </td>
                      <td>
                        <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>
                          {item.stage_key || item.stage || 'Check-in Lifecycle'}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                        {item.template_name || 'booking_notice'}
                      </td>
                      <td>
                        <span className={`badge ${
                          item.status === 'READ' ? 'badge-info' :
                          item.status === 'DELIVERED' || item.status === 'SENT' ? 'badge-success' : 'badge-danger'
                        }`}>
                          {item.status || 'SENT'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.75rem', color: '#64748B' }}>
                        {item.dispatched_at || item.created_at ? new Date(item.dispatched_at || item.created_at).toLocaleString() : 'Just now'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
