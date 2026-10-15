import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Download, 
  FileSpreadsheet, 
  Clock, 
  Layers,
  Search
} from 'lucide-react';

export default function ReportsPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('campaigns'); // 'campaigns' | 'automation'
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [campaignReports, setCampaignReports] = useState([]);
  const [automationReports, setAutomationReports] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadReportsData();
  }, [selectedStatus]);

  async function loadReportsData() {
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };

      // Overview stats
      const overRes = await fetch('/api/reports/overview', { headers });
      const overData = await overRes.json();
      if (overData.success) setOverview(overData.data);

      // Campaign recipient logs
      const url = selectedStatus !== 'ALL' 
        ? `/api/reports/campaigns?status=${selectedStatus}` 
        : '/api/reports/campaigns';
      const campRes = await fetch(url, { headers });
      const campData = await campRes.json();
      if (campData.success) setCampaignReports(campData.data || []);

      // Automation dispatches
      const autoRes = await fetch('/api/reports/automation', { headers });
      const autoData = await autoRes.json();
      if (autoData.success) setAutomationReports(autoData.data || []);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleExport(format) {
    const exportUrl = `/api/reports/campaigns/export?format=${format}`;
    fetch(exportUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.blob())
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

  const filteredCampaignReports = campaignReports.filter(r => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (r.recipient_name && r.recipient_name.toLowerCase().includes(q)) ||
      (r.phone_number && r.phone_number.includes(q)) ||
      (r.campaign_name && r.campaign_name.toLowerCase().includes(q)) ||
      (r.meta_message_id && r.meta_message_id.toLowerCase().includes(q))
    );
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
            Audited recipient delivery logs, Meta handshake diagnostics, and 1-click Excel/CSV data exports.
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
            onClick={() => handleExport('excel')}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '28px' }}>
          <div className="saas-card" style={{ padding: '20px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Broadcasts</div>
            <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0F172A', marginTop: '6px' }}>
              {overview.totalBroadcasts || 0}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
              {overview.activeScheduled || 0} scheduled queue
            </div>
          </div>

          <div className="saas-card" style={{ padding: '20px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Recipients Targeted</div>
            <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#2563EB', marginTop: '6px' }}>
              {(overview.totalRecipients || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
              Audience volume
            </div>
          </div>

          <div className="saas-card" style={{ padding: '20px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Delivered Rate</div>
            <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#15803D', marginTop: '6px' }}>
              {overview.deliveryRate || '0%'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#15803D', marginTop: '4px' }}>
              {(overview.totalDelivered || 0).toLocaleString()} handset delivered
            </div>
          </div>

          <div className="saas-card" style={{ padding: '20px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Read Receipts</div>
            <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#D97706', marginTop: '6px' }}>
              {(overview.totalRead || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
              Blue double ticks verified
            </div>
          </div>

          <div className="saas-card" style={{ padding: '20px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Delivery Failures</div>
            <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#DC2626', marginTop: '6px' }}>
              {(overview.totalFailed || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#DC2626', marginTop: '4px' }}>
              Invalid / Blocked
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
            <Layers size={16} /> Broadcast Recipient Audit ({filteredCampaignReports.length})
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
            <Clock size={16} /> 4-Stage Booking Lifecycle Dispatches ({automationReports.length})
          </button>
        </div>

        {activeTab === 'campaigns' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '8px' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search recipient or campaign..."
                className="saas-input"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: '260px', paddingLeft: '32px', fontSize: '0.825rem', padding: '7px 10px 7px 32px' }}
              />
              <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            </div>

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
          </div>
        )}
      </div>

      {/* TAB 1: BROADCAST RECIPIENTS TABLE */}
      {activeTab === 'campaigns' && (
        <div className="saas-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', maxHeight: '560px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Recipient Name</th>
                  <th>Phone Number</th>
                  <th>Campaign Name</th>
                  <th>Template Name</th>
                  <th>Delivery Status</th>
                  <th>Meta Message ID</th>
                  <th>Error Diagnostic</th>
                  <th>Dispatched At</th>
                </tr>
              </thead>
              <tbody>
                {filteredCampaignReports.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: '#94A3B8' }}>
                      No recipient delivery logs matching current filter.
                    </td>
                  </tr>
                ) : (
                  filteredCampaignReports.map((item, idx) => (
                    <tr key={item.id || idx}>
                      <td style={{ fontWeight: 700, color: '#0F172A' }}>
                        {item.recipient_name || 'Guest'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.825rem' }}>
                        {item.phone_number}
                      </td>
                      <td>
                        <span style={{ color: '#475569', fontWeight: 500 }}>{item.campaign_name || 'Campaign'}</span>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>
                          {item.template_name}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${
                          item.delivery_status === 'READ' ? 'badge-info' :
                          item.delivery_status === 'DELIVERED' ? 'badge-success' :
                          item.delivery_status === 'SENT' ? 'badge-warning' : 'badge-danger'
                        }`}>
                          {item.delivery_status}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#64748B' }}>
                        {item.meta_message_id || 'N/A'}
                      </td>
                      <td style={{ color: '#DC2626', fontSize: '0.75rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.error_reason || '-'}
                      </td>
                      <td style={{ fontSize: '0.75rem', color: '#64748B' }}>
                        {item.dispatched_at ? new Date(item.dispatched_at).toLocaleString() : 'N/A'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: AUTOMATION LIFECYCLE AUDIT TABLE */}
      {activeTab === 'automation' && (
        <div className="saas-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', maxHeight: '560px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Booking Reference</th>
                  <th>Customer Contact</th>
                  <th>Lifecycle Stage</th>
                  <th>Template Dispatched</th>
                  <th>Scheduled Time</th>
                  <th>Status</th>
                  <th>Execution Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {automationReports.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: '#94A3B8' }}>
                      No automated lifecycle dispatches recorded yet.
                    </td>
                  </tr>
                ) : (
                  automationReports.map((item, idx) => (
                    <tr key={item.id || idx}>
                      <td style={{ fontWeight: 700, color: '#0F172A', fontFamily: 'var(--font-mono)' }}>
                        {item.booking_id || `KT-AUTO-${idx + 1}`}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{item.customer_name || 'Guest'}</div>
                        <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: '#64748B' }}>{item.phone_number}</div>
                      </td>
                      <td>
                        <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>
                          {item.stage_key || 'Check-in Lifecycle'}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                        {item.template_name || 'booking_notice'}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#475569' }}>
                        {item.target_time || '10:00 AM'}
                      </td>
                      <td>
                        <span className={`badge ${item.status === 'SENT' ? 'badge-success' : 'badge-warning'}`}>
                          {item.status || 'SENT'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.75rem', color: '#64748B' }}>
                        {item.created_at ? new Date(item.created_at).toLocaleString() : 'Just now'}
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
