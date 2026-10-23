import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Layers, 
  Plus, 
  RefreshCw, 
  Search, 
  Send, 
  Key, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ExternalLink, 
  Trash2, 
  Edit3, 
  UploadCloud, 
  FileText, 
  Lock, 
  Copy, 
  Download, 
  Eye, 
  Check, 
  HelpCircle,
  X,
  Sparkles,
  Inbox
} from 'lucide-react';

export default function FlowsPage() {
  const { token, isAdmin } = useAuth();

  // Tab navigation
  const [currentTab, setCurrentTab] = useState('flows'); // 'flows' | 'responses' | 'crypto'

  // Flows list state
  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isFeatureEnabled, setIsFeatureEnabled] = useState(true);

  // Starter templates
  const [starterTemplates, setStarterTemplates] = useState([]);

  // Modals & Drawers
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingFlow, setEditingFlow] = useState(null);
  const [isTestSendOpen, setIsTestSendOpen] = useState(false);
  const [testSendFlow, setTestSendFlow] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailFlow, setDetailFlow] = useState(null);

  // Form Editor state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('LEAD_GENERATION');
  const [formEndpoint, setFormEndpoint] = useState('');
  const [formJson, setFormJson] = useState('');
  const [jsonError, setJsonError] = useState(null);
  const [savingFlow, setSavingFlow] = useState(false);
  const [pushingMeta, setPushingMeta] = useState(false);

  // Test Send state
  const [testPhone, setTestPhone] = useState('');
  const [testBody, setTestBody] = useState('');
  const [testCta, setTestCta] = useState('Open Form');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Submissions state
  const [responses, setResponses] = useState([]);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [responseSearch, setResponseSearch] = useState('');
  const [selectedResponse, setSelectedResponse] = useState(null);

  // Crypto config state
  const [cryptoConfig, setCryptoConfig] = useState(null);
  const [loadingCrypto, setLoadingCrypto] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);

  // Notification Banner
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 6000);
  };

  // Fetch Flows
  const fetchFlows = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/flows', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setFlows(data.data || []);
        setIsFeatureEnabled(data.isFeatureEnabled !== false);
      } else {
        setError(data.message || 'Failed to load flows.');
      }
    } catch (err) {
      setError('Network connection error fetching flows.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch Starter Templates
  const fetchStarterTemplates = async () => {
    try {
      const res = await fetch('/api/flows/starter-templates', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setStarterTemplates(data.data || []);
      }
    } catch (e) {}
  };

  // Fetch Responses
  const fetchResponses = async () => {
    setLoadingResponses(true);
    try {
      const res = await fetch('/api/flows/responses', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setResponses(data.data || []);
      }
    } catch (e) {
    } finally {
      setLoadingResponses(false);
    }
  };

  // Fetch Crypto Config
  const fetchCryptoConfig = async () => {
    setLoadingCrypto(true);
    try {
      const res = await fetch('/api/flows/crypto/config', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setCryptoConfig(data);
      }
    } catch (e) {}
    finally {
      setLoadingCrypto(false);
    }
  };

  useEffect(() => {
    fetchFlows();
    fetchStarterTemplates();
  }, [token]);

  useEffect(() => {
    if (currentTab === 'responses') {
      fetchResponses();
    } else if (currentTab === 'crypto') {
      fetchCryptoConfig();
    }
  }, [currentTab]);

  // Sync with Meta
  const handleSyncMeta = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/flows/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        showNotification(data.message || 'Flows successfully synchronized with Meta.');
        fetchFlows();
      } else {
        showNotification(data.message || 'Sync failed.', 'error');
      }
    } catch (e) {
      showNotification(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Open Editor for Create
  const handleOpenCreate = (templateKey = null) => {
    setEditingFlow(null);
    setJsonError(null);

    if (templateKey) {
      const tpl = starterTemplates.find(t => t.key === templateKey);
      if (tpl) {
        setFormName(tpl.name);
        setFormDescription(tpl.description);
        setFormCategory(tpl.category || 'LEAD_GENERATION');
        setFormEndpoint('');
        setFormJson(JSON.stringify(tpl.flow_json, null, 2));
      }
    } else {
      setFormName('');
      setFormDescription('');
      setFormCategory('LEAD_GENERATION');
      setFormEndpoint('');
      const defaultTpl = starterTemplates[0]?.flow_json || {
        version: "3.1",
        data_api_version: "3.0",
        routing_model: { SCREEN_0: [] },
        screens: [{ id: "SCREEN_0", title: "Customer Form", terminal: true, layout: { type: "SingleColumnLayout", children: [] } }]
      };
      setFormJson(JSON.stringify(defaultTpl, null, 2));
    }
    setIsEditorOpen(true);
  };

  // Open Editor for Edit
  const handleOpenEdit = (flow) => {
    setEditingFlow(flow);
    setFormName(flow.name);
    setFormDescription(flow.description || '');
    setFormCategory(flow.categories?.[0] || 'OTHER');
    setFormEndpoint(flow.endpoint_uri || '');
    setJsonError(null);

    const jsonStr = typeof flow.flow_json === 'object' ? JSON.stringify(flow.flow_json, null, 2) : flow.flow_json;
    setFormJson(jsonStr);
    setIsEditorOpen(true);
  };

  // Save Flow Draft
  const handleSaveFlow = async () => {
    setJsonError(null);
    let parsed = null;
    try {
      parsed = JSON.parse(formJson);
    } catch (err) {
      setJsonError('Invalid JSON: ' + err.message);
      return;
    }

    if (!formName.trim()) {
      showNotification('Please enter a Flow name.', 'error');
      return;
    }

    setSavingFlow(true);
    try {
      const url = editingFlow ? `/api/flows/${editingFlow.id}` : '/api/flows';
      const method = editingFlow ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: formName,
          description: formDescription,
          categories: [formCategory],
          endpoint_uri: formEndpoint,
          flow_json: parsed
        })
      });

      const data = await res.json();
      if (data.success) {
        showNotification(data.message || 'Flow saved successfully!');
        setIsEditorOpen(false);
        fetchFlows();
      } else {
        if (data.errors && data.errors.length > 0) {
          setJsonError(data.errors.join(' | '));
        } else {
          showNotification(data.message || 'Failed to save Flow.', 'error');
        }
      }
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setSavingFlow(false);
    }
  };

  // Push to Meta
  const handlePushToMeta = async (flowId) => {
    if (!window.confirm("Upload this Flow definition and assets to Meta WhatsApp Business Platform?")) return;
    setPushingMeta(true);
    try {
      const res = await fetch(`/api/flows/${flowId}/push`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        showNotification(data.message || 'Flow pushed to Meta successfully!');
        fetchFlows();
      } else {
        const errorDetails = data.validationErrors?.length > 0
          ? data.validationErrors.map(e => `${e.error || e.message}`).join(', ')
          : data.message;
        showNotification(`Meta Upload Notice: ${errorDetails}`, 'error');
      }
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setPushingMeta(false);
    }
  };

  // Publish Flow
  const handlePublishFlow = async (flowId) => {
    if (!window.confirm("Publishing this Flow makes it live for all customers on WhatsApp. Do you want to proceed?")) return;
    try {
      const res = await fetch(`/api/flows/${flowId}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        showNotification(data.message || 'Flow published successfully!');
        fetchFlows();
      } else {
        showNotification(data.message || 'Publishing failed.', 'error');
      }
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  // Deprecate Flow
  const handleDeprecateFlow = async (flowId) => {
    if (!window.confirm("Deprecate this Flow? Deprecated flows cannot be sent to new recipients.")) return;
    try {
      const res = await fetch(`/api/flows/${flowId}/deprecate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        showNotification(data.message || 'Flow deprecated.');
        fetchFlows();
      } else {
        showNotification(data.message, 'error');
      }
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  // Delete Flow
  const handleDeleteFlow = async (flowId, flowName) => {
    if (!window.confirm(`Are you sure you want to delete the flow "${flowName}"? This action cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/flows/${flowId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        showNotification('Flow deleted successfully.');
        fetchFlows();
      } else {
        showNotification(data.message, 'error');
      }
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  // Open Test Send Modal
  const handleOpenTestSend = (flow) => {
    setTestSendFlow(flow);
    setTestPhone('');
    setTestBody(`Hi! Please take a moment to complete the ${flow.name} form below:`);
    setTestCta('Open Form');
    setTestResult(null);
    setIsTestSendOpen(true);
  };

  // Submit Test Send
  const handleSendTestFlow = async () => {
    if (!testPhone.trim()) {
      showNotification('Please enter a recipient phone number.', 'error');
      return;
    }

    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/flows/${testSendFlow.id}/send-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          to: testPhone,
          bodyText: testBody,
          ctaText: testCta,
          headerText: testSendFlow.name,
          footerText: 'KonkanTrip Concierge'
        })
      });

      const data = await res.json();
      if (data.success) {
        setTestResult({
          type: 'success',
          msg: data.message,
          messageId: data.messageId,
          flowToken: data.flowToken
        });
        showNotification('Flow message dispatched successfully!');
      } else {
        setTestResult({
          type: 'error',
          msg: data.message
        });
      }
    } catch (err) {
      setTestResult({ type: 'error', msg: err.message });
    } finally {
      setSendingTest(false);
    }
  };

  // Generate Keypair
  const handleGenerateKeypair = async () => {
    if (!window.confirm("Generate a new RSA 2048-bit keypair for WhatsApp Flows Data-Exchange? This will replace any existing keys.")) return;
    setGeneratingKey(true);
    try {
      const res = await fetch('/api/flows/crypto/generate-keypair', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        showNotification(data.message || 'New keypair generated!');
        fetchCryptoConfig();
      } else {
        showNotification(data.message, 'error');
      }
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setGeneratingKey(false);
    }
  };

  // Copy Key to Clipboard
  const handleCopyKey = () => {
    if (cryptoConfig?.publicKey) {
      navigator.clipboard.writeText(cryptoConfig.publicKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 3000);
    }
  };

  // Filtered Flows
  const filteredFlows = flows.filter(f => {
    const matchesSearch = !search || 
      f.name?.toLowerCase().includes(search.toLowerCase()) ||
      f.description?.toLowerCase().includes(search.toLowerCase()) ||
      f.meta_flow_id?.includes(search);
    
    const matchesCat = categoryFilter === 'ALL' || f.categories?.includes(categoryFilter);
    const matchesStatus = statusFilter === 'ALL' || f.status === statusFilter;
    return matchesSearch && matchesCat && matchesStatus;
  });

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px 20px 48px' }}>
      
      {/* Top Banner / Notifications */}
      {notification && (
        <div style={{
          marginBottom: '20px',
          padding: '12px 18px',
          borderRadius: '10px',
          background: notification.type === 'error' ? '#FEE2E2' : '#DCFCE7',
          color: notification.type === 'error' ? '#B91C1C' : '#15803D',
          border: `1px solid ${notification.type === 'error' ? '#FCA5A5' : '#86EFAC'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.9rem',
          fontWeight: 600,
          boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {notification.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span>{notification.msg}</span>
          </div>
          <button 
            onClick={() => setNotification(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Feature Flag Notice if Disabled */}
      {!isFeatureEnabled && (
        <div style={{
          marginBottom: '24px',
          padding: '16px 20px',
          borderRadius: '12px',
          background: '#FFFBEB',
          border: '1px solid #FDE68A',
          color: '#92400E',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircle size={20} color="#D97706" />
            <div>
              <strong style={{ fontSize: '0.95rem' }}>WhatsApp Flows Feature is Disabled</strong>
              <div style={{ fontSize: '0.82rem', marginTop: '2px', color: '#B45309' }}>
                Flow creation and test sending are currently in preview mode. Administrators can enable this feature under Line & API Settings.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '28px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #059669, #0d9488)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              boxShadow: '0 3px 10px rgba(13, 148, 136, 0.25)'
            }}>
              <Layers size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>
                WhatsApp Interactive Flows
              </h1>
              <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#64748B' }}>
                Build, publish, and send rich native forms directly inside WhatsApp chats.
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {isAdmin && (
            <button
              onClick={handleSyncMeta}
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 16px',
                borderRadius: '8px',
                background: '#FFFFFF',
                border: '1px solid #CBD5E1',
                color: '#334155',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              Sync with Meta
            </button>
          )}

          <button
            onClick={() => handleOpenCreate()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 18px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #128C7E, #0d7064)',
              border: 'none',
              color: '#FFFFFF',
              fontSize: '0.88rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 3px 12px rgba(18, 140, 126, 0.3)',
              transition: 'all 0.2s ease'
            }}
          >
            <Plus size={16} strokeWidth={2.5} />
            Create Flow
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-color)',
        marginBottom: '24px',
        gap: '8px'
      }}>
        <button
          onClick={() => setCurrentTab('flows')}
          style={{
            padding: '10px 18px',
            background: 'none',
            border: 'none',
            borderBottom: currentTab === 'flows' ? '3px solid #128C7E' : '3px solid transparent',
            color: currentTab === 'flows' ? '#128C7E' : '#64748B',
            fontWeight: currentTab === 'flows' ? 700 : 500,
            fontSize: '0.92rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Layers size={17} />
          Flows Library ({flows.length})
        </button>

        <button
          onClick={() => setCurrentTab('responses')}
          style={{
            padding: '10px 18px',
            background: 'none',
            border: 'none',
            borderBottom: currentTab === 'responses' ? '3px solid #128C7E' : '3px solid transparent',
            color: currentTab === 'responses' ? '#128C7E' : '#64748B',
            fontWeight: currentTab === 'responses' ? 700 : 500,
            fontSize: '0.92rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Inbox size={17} />
          Customer Submissions
        </button>

        <button
          onClick={() => setCurrentTab('crypto')}
          style={{
            padding: '10px 18px',
            background: 'none',
            border: 'none',
            borderBottom: currentTab === 'crypto' ? '3px solid #128C7E' : '3px solid transparent',
            color: currentTab === 'crypto' ? '#128C7E' : '#64748B',
            fontWeight: currentTab === 'crypto' ? 700 : 500,
            fontSize: '0.92rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Key size={17} />
          Endpoint & Encryption Keys
        </button>
      </div>

      {/* TAB 1: FLOWS DIRECTORY */}
      {currentTab === 'flows' && (
        <div>
          {/* Starter Template Highlights */}
          {flows.length === 0 && !loading && (
            <div style={{
              background: '#FFFFFF',
              borderRadius: '14px',
              padding: '24px',
              border: '1px solid var(--border-color)',
              marginBottom: '28px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <Sparkles size={20} color="#D97706" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>
                  Quick Start with Validated Templates
                </h3>
              </div>
              <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: '#64748B' }}>
                Select a pre-designed Meta Flow template to customize and deploy in seconds:
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
                {starterTemplates.map(tpl => (
                  <div
                    key={tpl.key}
                    onClick={() => handleOpenCreate(tpl.key)}
                    style={{
                      border: '1px solid #E2E8F0',
                      borderRadius: '10px',
                      padding: '16px',
                      cursor: 'pointer',
                      background: '#F8FAFC',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#128C7E'; e.currentTarget.style.background = '#F0FDF4'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = '#F8FAFC'; }}
                  >
                    <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.92rem' }}>{tpl.name}</div>
                    <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '4px', lineHeight: 1.4 }}>{tpl.description}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px' }}>
                      <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: '#E0F2FE', color: '#0369A1', fontWeight: 600 }}>
                        {tpl.category}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#128C7E', fontWeight: 600, marginLeft: 'auto' }}>
                        Use Template →
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filter Bar */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px', maxWidth: '400px' }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Search flows by name or ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 36px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.85rem'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.82rem',
                  background: '#FFFFFF',
                  color: '#334155'
                }}
              >
                <option value="ALL">All Categories</option>
                <option value="LEAD_GENERATION">Lead Generation</option>
                <option value="APPOINTMENT_BOOKING">Appointment Booking</option>
                <option value="CUSTOMER_SUPPORT">Customer Support</option>
                <option value="SURVEY">Feedback / Survey</option>
                <option value="OTHER">Other</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.82rem',
                  background: '#FFFFFF',
                  color: '#334155'
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="DEPRECATED">Deprecated</option>
              </select>
            </div>
          </div>

          {/* Flows Grid */}
          {loading ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94A3B8' }}>
              <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px', color: '#128C7E' }} />
              <div>Loading WhatsApp Flows...</div>
            </div>
          ) : filteredFlows.length === 0 ? (
            <div style={{
              background: '#FFFFFF',
              border: '1px dashed #CBD5E1',
              borderRadius: '14px',
              padding: '60px 20px',
              textAlign: 'center'
            }}>
              <Layers size={40} color="#94A3B8" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ margin: '0 0 6px', fontSize: '1.1rem', color: '#0F172A' }}>No WhatsApp Flows Found</h3>
              <p style={{ margin: '0 0 18px', color: '#64748B', fontSize: '0.85rem' }}>
                {search ? 'Try clearing your search terms or filters.' : 'Create your first Flow using one of our starter templates.'}
              </p>
              <button
                onClick={() => handleOpenCreate()}
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  background: '#128C7E',
                  color: '#FFFFFF',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Create New Flow
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '18px' }}>
              {filteredFlows.map(flow => {
                const isPublished = flow.status === 'PUBLISHED';
                const isDraft = flow.status === 'DRAFT';
                const isDeprecated = flow.status === 'DEPRECATED';

                return (
                  <div
                    key={flow.id}
                    style={{
                      background: '#FFFFFF',
                      borderRadius: '12px',
                      border: '1px solid var(--border-color)',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                      transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                    }}
                  >
                    <div>
                      {/* Top Header of Card */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A', lineHeight: 1.3 }}>
                            {flow.name}
                          </h3>
                          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px', fontFamily: 'monospace' }}>
                            {flow.meta_flow_id ? `Meta ID: ${flow.meta_flow_id}` : 'Local Draft (Not Pushed)'}
                          </div>
                        </div>

                        {/* Status Badge */}
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: isPublished ? '#DCFCE7' : (isDraft ? '#FEF3C7' : '#F1F5F9'),
                          color: isPublished ? '#15803D' : (isDraft ? '#B45309' : '#64748B'),
                          border: `1px solid ${isPublished ? '#BBF7D0' : (isDraft ? '#FDE68A' : '#E2E8F0')}`
                        }}>
                          {flow.status}
                        </span>
                      </div>

                      {/* Description */}
                      <p style={{
                        fontSize: '0.82rem',
                        color: '#475569',
                        margin: '12px 0 16px',
                        lineHeight: 1.4,
                        minHeight: '36px'
                      }}>
                        {flow.description || 'No description provided.'}
                      </p>

                      {/* Meta Pills */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
                        {flow.categories?.map((cat, idx) => (
                          <span key={idx} style={{
                            fontSize: '0.7rem',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: '#F1F5F9',
                            color: '#475569',
                            fontWeight: 600
                          }}>
                            {cat}
                          </span>
                        ))}
                        <span style={{
                          fontSize: '0.7rem',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: '#EFF6FF',
                          color: '#1E40AF',
                          fontWeight: 600
                        }}>
                          {flow.response_count || 0} Submissions
                        </span>
                      </div>

                      {/* Validation Warnings if any */}
                      {flow.validation_errors?.length > 0 && (
                        <div style={{
                          padding: '8px 10px',
                          borderRadius: '6px',
                          background: '#FFF1F2',
                          border: '1px solid #FECDD3',
                          fontSize: '0.74rem',
                          color: '#9F1239',
                          marginBottom: '14px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <AlertCircle size={14} style={{ flexShrink: 0 }} />
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {flow.validation_errors[0]?.error || flow.validation_errors[0]?.message || 'Validation warning on Meta.'}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Card Actions */}
                    <div style={{
                      borderTop: '1px solid #F1F5F9',
                      paddingTop: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          onClick={() => handleOpenEdit(flow)}
                          title="Edit Flow Definition"
                          style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            background: '#F8FAFC',
                            border: '1px solid #CBD5E1',
                            color: '#334155',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Edit3 size={13} />
                          Edit
                        </button>

                        {/* Send Test Button */}
                        <button
                          onClick={() => handleOpenTestSend(flow)}
                          disabled={!flow.meta_flow_id}
                          title={!flow.meta_flow_id ? 'Push to Meta first before test sending' : 'Send interactive Flow to WhatsApp phone'}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            background: flow.meta_flow_id ? '#F0FDF4' : '#F1F5F9',
                            border: `1px solid ${flow.meta_flow_id ? '#BBF7D0' : '#E2E8F0'}`,
                            color: flow.meta_flow_id ? '#15803D' : '#94A3B8',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: flow.meta_flow_id ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Send size={13} />
                          Send
                        </button>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {/* Meta Push / Publish action */}
                        {isAdmin && (
                          <>
                            {isDraft && (
                              <button
                                onClick={() => handlePushToMeta(flow.id)}
                                disabled={pushingMeta}
                                title="Push assets to Meta Cloud API"
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: '6px',
                                  background: '#EFF6FF',
                                  border: '1px solid #BFDBFE',
                                  color: '#1D4ED8',
                                  fontSize: '0.78rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <UploadCloud size={13} />
                                {flow.meta_flow_id ? 'Re-upload' : 'Push'}
                              </button>
                            )}

                            {isDraft && flow.meta_flow_id && (
                              <button
                                onClick={() => handlePublishFlow(flow.id)}
                                title="Publish Flow on Meta"
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: '6px',
                                  background: '#128C7E',
                                  border: 'none',
                                  color: '#FFFFFF',
                                  fontSize: '0.78rem',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                Publish
                              </button>
                            )}

                            {isPublished && (
                              <button
                                onClick={() => handleDeprecateFlow(flow.id)}
                                title="Deprecate Flow"
                                style={{
                                  padding: '6px 8px',
                                  borderRadius: '6px',
                                  background: '#FFFBEB',
                                  border: '1px solid #FDE68A',
                                  color: '#B45309',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                Deprecate
                              </button>
                            )}
                          </>
                        )}

                        <button
                          onClick={() => handleDeleteFlow(flow.id, flow.name)}
                          title="Delete Flow"
                          style={{
                            padding: '6px 8px',
                            borderRadius: '6px',
                            background: '#FFF1F2',
                            border: '1px solid #FECDD3',
                            color: '#E11D48',
                            fontSize: '0.75rem',
                            cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SUBMISSIONS & RESPONSES */}
      {currentTab === 'responses' && (
        <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid var(--border-color)', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>
                Customer Flow Submissions ({responses.length})
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                Real-time answers submitted by customers when completing WhatsApp Flows.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ position: 'relative', width: '260px' }}>
                <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Filter by customer or phone..."
                  value={responseSearch}
                  onChange={(e) => setResponseSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px 7px 32px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.82rem'
                  }}
                />
              </div>

              <button
                onClick={fetchResponses}
                disabled={loadingResponses}
                style={{
                  padding: '7px 12px',
                  borderRadius: '8px',
                  background: '#F8FAFC',
                  border: '1px solid #CBD5E1',
                  color: '#334155',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <RefreshCw size={14} className={loadingResponses ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>

          {loadingResponses ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94A3B8' }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px', color: '#128C7E' }} />
              <div>Loading submissions...</div>
            </div>
          ) : responses.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748B' }}>
              <Inbox size={36} color="#CBD5E1" style={{ margin: '0 auto 10px' }} />
              <div style={{ fontWeight: 600 }}>No Flow Submissions Yet</div>
              <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>
                When customers fill out and submit interactive Flows on their WhatsApp device, their answers will automatically appear here.
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', textAlign: 'left' }}>
                    <th style={{ padding: '10px 14px' }}>Timestamp</th>
                    <th style={{ padding: '10px 14px' }}>Customer</th>
                    <th style={{ padding: '10px 14px' }}>Flow Name</th>
                    <th style={{ padding: '10px 14px' }}>Submitted Answers</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {responses
                    .filter(r => !responseSearch || 
                      r.customer_name?.toLowerCase().includes(responseSearch.toLowerCase()) ||
                      r.from_phone?.includes(responseSearch) ||
                      JSON.stringify(r.parsed_data || {}).toLowerCase().includes(responseSearch.toLowerCase())
                    )
                    .map(item => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: '#64748B', fontSize: '0.8rem' }}>
                          {item.created_at ? new Date(item.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—'}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 700, color: '#0F172A' }}>{item.customer_name || 'Customer'}</div>
                          <div style={{ fontSize: '0.78rem', color: '#64748B', fontFamily: 'monospace' }}>+{item.from_phone}</div>
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: '#1E293B' }}>
                          {item.flow_name || `Flow ${item.flow_id}`}
                        </td>
                        <td style={{ padding: '12px 14px', maxWidth: '380px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {Object.entries(item.parsed_data || {})
                              .filter(([k]) => k !== 'flow_token')
                              .slice(0, 4)
                              .map(([k, v], idx) => (
                                <span key={idx} style={{
                                  fontSize: '0.72rem',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: '#F1F5F9',
                                  color: '#334155'
                                }}>
                                  <strong>{k.replace(/^[a-zA-Z0-9]+_/, '')}:</strong> {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                </span>
                              ))}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <button
                            onClick={() => setSelectedResponse(item)}
                            style={{
                              padding: '5px 10px',
                              borderRadius: '6px',
                              background: '#F8FAFC',
                              border: '1px solid #CBD5E1',
                              color: '#334155',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ENDPOINT & ENCRYPTION KEYS */}
      {currentTab === 'crypto' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
          
          {/* Key Management Card */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '14px',
            border: '1px solid var(--border-color)',
            padding: '24px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#F0FDF4', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Key size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>
                  Meta Flow Encryption Keys
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                  RSA 2048-bit keypair for encrypting dynamic data exchange between Meta and your server.
                </div>
              </div>
            </div>

            <div style={{
              padding: '12px 16px',
              borderRadius: '8px',
              background: cryptoConfig?.hasPrivateKey ? '#F0FDF4' : '#FFFBEB',
              border: `1px solid ${cryptoConfig?.hasPrivateKey ? '#BBF7D0' : '#FDE68A'}`,
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {cryptoConfig?.hasPrivateKey ? (
                  <CheckCircle2 size={18} color="#16A34A" />
                ) : (
                  <AlertCircle size={18} color="#D97706" />
                )}
                <span style={{ fontSize: '0.88rem', fontWeight: 600, color: cryptoConfig?.hasPrivateKey ? '#166534' : '#92400E' }}>
                  {cryptoConfig?.hasPrivateKey ? 'Private Encryption Key Configured & Active' : 'No Private Key Configured'}
                </span>
              </div>

              {isAdmin && (
                <button
                  onClick={handleGenerateKeypair}
                  disabled={generatingKey}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {generatingKey ? 'Generating...' : (cryptoConfig?.hasPrivateKey ? 'Regenerate' : 'Generate Keypair')}
                </button>
              )}
            </div>

            {/* Public Key Display */}
            {cryptoConfig?.publicKey ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                    RSA Public Key (Upload this to Meta WhatsApp Manager):
                  </label>
                  <button
                    onClick={handleCopyKey}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#128C7E',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {copiedKey ? <Check size={14} color="#16A34A" /> : <Copy size={14} />}
                    {copiedKey ? 'Copied!' : 'Copy PEM'}
                  </button>
                </div>

                <textarea
                  readOnly
                  rows={6}
                  value={cryptoConfig.publicKey}
                  style={{
                    width: '100%',
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    background: '#F8FAFC',
                    color: '#334155'
                  }}
                />
              </div>
            ) : (
              <div style={{ fontSize: '0.82rem', color: '#64748B', fontStyle: 'italic' }}>
                Click "Generate Keypair" above to create an RSA 2048-bit keypair for your server.
              </div>
            )}
          </div>

          {/* Flow Endpoint Card */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '14px',
            border: '1px solid var(--border-color)',
            padding: '24px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ExternalLink size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>
                  Dynamic Flow Endpoint URL
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                  HTTPS endpoint configured on Meta WhatsApp Business Manager.
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                Your Server Data-Exchange Endpoint:
              </label>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                background: '#F8FAFC',
                border: '1px solid #CBD5E1',
                borderRadius: '8px',
                fontFamily: 'monospace',
                fontSize: '0.82rem',
                color: '#0F172A'
              }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {cryptoConfig?.endpointUrl || 'https://whatsapp.konkantrip.com/api/flows/exchange'}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(cryptoConfig?.endpointUrl || 'https://whatsapp.konkantrip.com/api/flows/exchange');
                    showNotification('Endpoint URL copied to clipboard.');
                  }}
                  style={{ background: 'none', border: 'none', color: '#128C7E', cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem' }}
                >
                  Copy
                </button>
              </div>
            </div>

            <div style={{ fontSize: '0.82rem', color: '#64748B', lineHeight: 1.5, background: '#F8FAFC', padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <strong style={{ color: '#0F172A', display: 'block', marginBottom: '6px' }}>How to link with Meta WhatsApp Manager:</strong>
              <ol style={{ margin: 0, paddingLeft: '18px' }}>
                <li>Log in to <strong>Meta WhatsApp Business Manager</strong>.</li>
                <li>Go to <strong>Account Tools → Flows</strong>.</li>
                <li>In Flow settings, paste the <strong>Endpoint URL</strong> above.</li>
                <li>Upload the <strong>RSA Public Key</strong> from the left panel.</li>
                <li>Meta will automatically verify the connection using an encrypted ping handshake!</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: FLOW EDITOR & BUILDER */}
      {isEditorOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '900px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Layers size={22} color="#128C7E" />
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>
                  {editingFlow ? `Edit Flow: ${editingFlow.name}` : 'Create WhatsApp Flow'}
                </h2>
              </div>
              <button
                onClick={() => setIsEditorOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              {/* Template Picker if new */}
              {!editingFlow && starterTemplates.length > 0 && (
                <div style={{ marginBottom: '18px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    Quick Load Template:
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {starterTemplates.map(tpl => (
                      <button
                        key={tpl.key}
                        type="button"
                        onClick={() => {
                          setFormName(tpl.name);
                          setFormDescription(tpl.description);
                          setFormCategory(tpl.category || 'LEAD_GENERATION');
                          setFormJson(JSON.stringify(tpl.flow_json, null, 2));
                        }}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '6px',
                          background: '#F1F5F9',
                          border: '1px solid #CBD5E1',
                          color: '#334155',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {tpl.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Form Metadata */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Flow Name *
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Guest Check-in Survey"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Category *
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.85rem',
                      background: '#FFFFFF'
                    }}
                  >
                    <option value="LEAD_GENERATION">Lead Generation</option>
                    <option value="APPOINTMENT_BOOKING">Appointment Booking</option>
                    <option value="CUSTOMER_SUPPORT">Customer Support</option>
                    <option value="SURVEY">Survey & Feedback</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Short note explaining this flow's purpose"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              {/* JSON Editor */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                    Flow JSON Definition (Meta Schema 3.1 / 6.0) *
                  </label>
                  <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    Must contain valid screens, layouts, and components
                  </span>
                </div>

                <textarea
                  rows={14}
                  value={formJson}
                  onChange={(e) => { setFormJson(e.target.value); setJsonError(null); }}
                  style={{
                    width: '100%',
                    fontFamily: 'Consolas, Monaco, monospace',
                    fontSize: '0.8rem',
                    padding: '12px',
                    borderRadius: '8px',
                    border: jsonError ? '1px solid #EF4444' : '1px solid #CBD5E1',
                    background: '#0F172A',
                    color: '#38BDF8',
                    lineHeight: 1.4
                  }}
                />

                {jsonError && (
                  <div style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: '#FEF2F2',
                    border: '1px solid #FCA5A5',
                    color: '#B91C1C',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <AlertCircle size={16} />
                    <span>{jsonError}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px'
            }}>
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  color: '#475569',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSaveFlow}
                disabled={savingFlow}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  background: '#128C7E',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: savingFlow ? 'not-allowed' : 'pointer'
                }}
              >
                {savingFlow ? 'Saving Draft...' : 'Save Draft'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: SEND TEST FLOW */}
      {isTestSendOpen && testSendFlow && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '520px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Send size={20} color="#128C7E" />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0F172A' }}>
                  Send Flow: {testSendFlow.name}
                </h3>
              </div>
              <button
                onClick={() => setIsTestSendOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Recipient Phone Number *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 919876543210"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.85rem'
                  }}
                />
                <span style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px', display: 'block' }}>
                  Enter mobile number with country code (e.g. 91 for India).
                </span>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Message Body
                </label>
                <textarea
                  rows={3}
                  value={testBody}
                  onChange={(e) => setTestBody(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Call To Action Button Label
                </label>
                <input
                  type="text"
                  maxLength={20}
                  value={testCta}
                  onChange={(e) => setTestCta(e.target.value)}
                  placeholder="Open Form"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              {testResult && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: testResult.type === 'success' ? '#F0FDF4' : '#FEF2F2',
                  border: `1px solid ${testResult.type === 'success' ? '#BBF7D0' : '#FCA5A5'}`,
                  color: testResult.type === 'success' ? '#166534' : '#991B1B',
                  fontSize: '0.82rem'
                }}>
                  {testResult.msg}
                  {testResult.messageId && (
                    <div style={{ marginTop: '4px', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      Message ID: {testResult.messageId}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{
              padding: '14px 24px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px'
            }}>
              <button
                type="button"
                onClick={() => setIsTestSendOpen(false)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  background: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  color: '#475569',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>

              <button
                type="button"
                onClick={handleSendTestFlow}
                disabled={sendingTest}
                style={{
                  padding: '7px 18px',
                  borderRadius: '8px',
                  background: '#128C7E',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: sendingTest ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Send size={14} />
                {sendingTest ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: VIEW SUBMISSION PAYLOAD */}
      {selectedResponse && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '600px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>
                Submission Details: {selectedResponse.customer_name || 'Customer'}
              </h3>
              <button
                onClick={() => setSelectedResponse(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              <div style={{ marginBottom: '14px', fontSize: '0.82rem' }}>
                <div><strong>Flow:</strong> {selectedResponse.flow_name || selectedResponse.flow_id}</div>
                <div><strong>Phone:</strong> +{selectedResponse.from_phone}</div>
                <div><strong>Submitted At:</strong> {selectedResponse.created_at}</div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <strong style={{ fontSize: '0.82rem', color: '#0F172A', display: 'block', marginBottom: '8px' }}>
                  Parsed Form Answers:
                </strong>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <tbody>
                    {Object.entries(selectedResponse.parsed_data || {}).map(([key, value], i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '8px', fontWeight: 600, color: '#475569', width: '40%' }}>
                          {key}
                        </td>
                        <td style={{ padding: '8px', color: '#0F172A' }}>
                          {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid #E2E8F0', textAlign: 'right' }}>
              <button
                onClick={() => setSelectedResponse(null)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  background: '#128C7E',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
