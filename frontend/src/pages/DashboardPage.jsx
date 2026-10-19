import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Send, 
  Cpu, 
  MessageSquare, 
  CheckCircle2, 
  Eye, 
  Layers, 
  ArrowUpRight,
  RefreshCw,
  Plus
} from 'lucide-react';
import { formatIndianDate } from '../utils/indianTime';

export default function DashboardPage({ setActiveTab }) {
  const { token } = useAuth();
  const [overview, setOverview] = useState(null);
  const [recentCampaigns, setRecentCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    setLoading(true);
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      
      const [overRes, campRes] = await Promise.all([
        fetch('/api/reports/overview', { headers }),
        fetch('/api/campaigns', { headers })
      ]);

      const overData = await overRes.json();
      const campData = await campRes.json();

      if (overData.success) setOverview(overData.data);
      if (campData.success && Array.isArray(campData.data)) {
        const formatted = campData.data.map(item => ({
          id: item.id,
          name: item.name,
          template: item.template_name || item.template || 'Template',
          created_at: item.created_at,
          status: item.status || 'COMPLETED',
          recipients: item.valid_contacts || item.total_contacts || 0,
          delivered: item.sent_count || 0,
          failed: item.failed_count || 0
        }));
        setRecentCampaigns(formatted.slice(0, 6));
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }

  // Calculate real rates
  const totalRecipients = overview?.totalRecipients || 0;
  const totalDelivered = overview?.totalDelivered || 0;
  const totalRead = overview?.totalRead || 0;
  const totalFailed = overview?.totalFailed || 0;
  const deliveryRate = totalRecipients > 0 ? ((totalDelivered / totalRecipients) * 100).toFixed(1) : 0;
  const readRate = totalDelivered > 0 ? ((totalRead / totalDelivered) * 100).toFixed(1) : 0;

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '28px 24px' }}>
      {/* Top Banner with Quick Actions */}
      <div style={{
        background: 'linear-gradient(135deg, #128C7E 0%, #0a5249 100%)',
        borderRadius: '14px',
        padding: '24px 28px',
        color: '#FFFFFF',
        marginBottom: '28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        boxShadow: 'var(--shadow-md)'
      }}>
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.85 }}>
            WhatsApp Business Cloud API Operations
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '4px', letterSpacing: '-0.02em' }}>
            Broadcasting & Booking Engine Overview
          </h1>
          <p style={{ fontSize: '0.875rem', opacity: 0.9, marginTop: '4px', maxWidth: '640px' }}>
            Monitor real-time recipient telemetry, manage high-volume broadcasts, and inspect automated 4-stage guest check-in journeys.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setActiveTab('broadcast')}
            className="btn"
            style={{
              background: '#FFFFFF',
              color: '#0d7064',
              fontWeight: 700,
              padding: '10px 18px',
              border: 'none',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <Send size={16} color="#0d7064" />
            <span>Launch Broadcast</span>
          </button>
          <button
            onClick={() => setActiveTab('automation')}
            className="btn"
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              color: '#FFFFFF',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              fontWeight: 600,
              padding: '10px 16px'
            }}
          >
            <Cpu size={16} />
            <span>Booking Automations</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '18px',
        marginBottom: '28px'
      }}>
        {/* Card 1: Total Campaigns */}
        <div className="saas-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Campaigns Launched</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Layers size={16} color="#16A34A" />
            </div>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0F172A', marginTop: '10px' }}>
            {overview?.totalBroadcasts || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
            {overview?.activeScheduled || 0} upcoming scheduled
          </div>
        </div>

        {/* Card 2: Total Recipients */}
        <div className="saas-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Total Recipients</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Send size={16} color="#2563EB" />
            </div>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0F172A', marginTop: '10px' }}>
            {totalRecipients.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
            Audited customer contacts
          </div>
        </div>

        {/* Card 3: Delivered & Delivery Rate */}
        <div className="saas-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Delivered Rate</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={16} color="#15803D" />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '10px' }}>
            <span style={{ fontSize: '1.85rem', fontWeight: 800, color: '#15803D' }}>
              {deliveryRate}%
            </span>
            <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>
              ({totalDelivered.toLocaleString()} msgs)
            </span>
          </div>
          <div style={{
            width: '100%',
            height: '6px',
            borderRadius: '999px',
            background: '#F1F5F9',
            marginTop: '8px',
            overflow: 'hidden'
          }}>
            <div style={{ width: `${Math.min(deliveryRate, 100)}%`, height: '100%', background: '#16A34A', borderRadius: '999px' }} />
          </div>
        </div>

        {/* Card 4: Read Rate */}
        <div className="saas-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Read Rate (Blue Ticks)</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Eye size={16} color="#D97706" />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '10px' }}>
            <span style={{ fontSize: '1.85rem', fontWeight: 800, color: '#D97706' }}>
              {readRate}%
            </span>
            <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>
              ({totalRead.toLocaleString()} read)
            </span>
          </div>
          <div style={{
            width: '100%',
            height: '6px',
            borderRadius: '999px',
            background: '#F1F5F9',
            marginTop: '8px',
            overflow: 'hidden'
          }}>
            <div style={{ width: `${Math.min(readRate, 100)}%`, height: '100%', background: '#F59E0B', borderRadius: '999px' }} />
          </div>
        </div>

        {/* Card 5: Automation Dispatches */}
        <div className="saas-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Booking Triggers</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#F3E8FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Cpu size={16} color="#9333EA" />
            </div>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0F172A', marginTop: '10px' }}>
            {overview?.totalDispatches || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
            4-Stage guest triggers sent
          </div>
        </div>
      </div>

      {/* Main Section: Recent Campaigns Table + Right Side Status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(320px, 1fr)', gap: '24px' }}>
        {/* Left: Recent Campaigns */}
        <div className="saas-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A' }}>
                Recent Broadcast Campaigns
              </h2>
              <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
                Real-time recipient delivery tracking by campaign
              </p>
            </div>
            <button
              onClick={() => setActiveTab('reports')}
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '6px 12px' }}
            >
              <span>View All Reports</span>
              <ArrowUpRight size={14} />
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
              <RefreshCw size={24} className="pulse-glow" style={{ margin: '0 auto 8px auto' }} />
              <div>Loading real campaign records...</div>
            </div>
          ) : recentCampaigns.length === 0 ? (
            <div style={{
              padding: '48px 24px',
              textAlign: 'center',
              border: '2px dashed var(--border-color)',
              borderRadius: '10px',
              background: '#F8FAFC'
            }}>
              <Send size={32} color="#94A3B8" style={{ margin: '0 auto 12px auto' }} />
              <div style={{ fontWeight: 600, color: '#334155' }}>No campaigns executed yet</div>
              <div style={{ fontSize: '0.825rem', color: '#64748B', marginTop: '4px' }}>
                Launch your first WhatsApp broadcast using approved Meta templates.
              </div>
              <button
                onClick={() => setActiveTab('broadcast')}
                className="btn btn-primary"
                style={{ marginTop: '16px' }}
              >
                <Plus size={16} />
                <span>Create Campaign</span>
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Template</th>
                    <th>Recipients</th>
                    <th>Delivery Rate</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCampaigns.map(camp => {
                    const cDelRate = camp.recipients > 0 ? Math.round((camp.delivered / camp.recipients) * 100) : 0;
                    return (
                      <tr key={camp.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: '#0F172A' }}>{camp.name}</div>
                          <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                            {formatIndianDate(camp.created_at)} • ID #{camp.id}
                          </div>
                        </td>
                        <td>
                          <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                            {camp.template}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{camp.recipients}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{
                              width: '60px',
                              height: '6px',
                              borderRadius: '999px',
                              background: '#E2E8F0',
                              overflow: 'hidden'
                            }}>
                              <div style={{ width: `${cDelRate}%`, height: '100%', background: '#16A34A' }} />
                            </div>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#15803D' }}>{cDelRate}%</span>
                          </div>
                        </td>
                        <td>
                          {camp.status === 'SCHEDULED' ? (
                            <span className="badge" style={{ background: '#EDE9FE', color: '#6D28D9', border: '1px solid #DDD6FE', fontWeight: 800 }}>
                              ⏰ SCHEDULED
                            </span>
                          ) : (
                            <span className={`badge ${
                              camp.status === 'COMPLETED' ? 'badge-success' :
                              camp.status === 'RUNNING' || camp.status === 'IN_PROGRESS' ? 'badge-info' :
                              camp.status === 'PAUSED' ? 'badge-warning' :
                              camp.status === 'CANCELLED' ? 'badge-neutral' :
                              camp.status === 'FAILED' ? 'badge-danger' : 'badge-neutral'
                            }`}>
                              {camp.status || 'COMPLETED'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Quick Automation & Meta Health Box */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Booking Lifecycle Card */}
          <div className="saas-card" style={{ padding: '22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Cpu size={18} color="#16A34A" />
              </div>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A' }}>Booking Automation</h3>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Google Sheet 4-Stage Triggers</div>
              </div>
            </div>

            <p style={{ fontSize: '0.825rem', color: '#475569', lineHeight: 1.5 }}>
              Automated messages are dispatched daily at your configured stage timings (Before Check-In, On Check-In, On Check-Out, and After Check-Out).
            </p>

            <div style={{
              background: '#F8FAFC',
              borderRadius: '8px',
              padding: '12px',
              marginTop: '14px',
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: '0.8rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Before Check-In (Day -1):</span>
                <span style={{ fontWeight: 600, color: '#0F172A' }}>11:00 AM</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Check-In Day (Day 0):</span>
                <span style={{ fontWeight: 600, color: '#0F172A' }}>09:00 AM</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Check-Out Day (Day 0):</span>
                <span style={{ fontWeight: 600, color: '#0F172A' }}>10:00 AM</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>After Check-Out (Day +1):</span>
                <span style={{ fontWeight: 600, color: '#0F172A' }}>02:00 PM</span>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('automation')}
              className="btn btn-secondary"
              style={{ width: '100%', marginTop: '16px', fontSize: '0.825rem' }}
            >
              <span>Manage Automation Rules</span>
              <ArrowUpRight size={14} />
            </button>
          </div>

          {/* 2-Way Inbox Quick Card */}
          <div className="saas-card" style={{ padding: '22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MessageSquare size={18} color="#2563EB" />
              </div>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A' }}>2-Way Guest Inbox</h3>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Live Webhook Replies</div>
              </div>
            </div>

            <p style={{ fontSize: '0.825rem', color: '#475569', lineHeight: 1.5 }}>
              Respond directly to inbound customer WhatsApp messages received through Meta Cloud webhooks.
            </p>

            <button
              onClick={() => setActiveTab('inbox')}
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '16px', fontSize: '0.825rem' }}
            >
              <MessageSquare size={15} />
              <span>Open 2-Way Inbox</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
