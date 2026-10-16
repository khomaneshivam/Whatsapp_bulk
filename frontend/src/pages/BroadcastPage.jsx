import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import PhoneMockup from '../components/PhoneMockup';
import { 
  Send, 
  UploadCloud, 
  CheckCircle2, 
  Calendar,
  Layers,
  ChevronRight,
  ChevronLeft,
  X,
  FileCheck,
  Info,
  Plus,
  Download,
  Table,
  FileSpreadsheet,
  Search,
  RefreshCw,
  Sliders,
  Gauge,
  Zap,
  ShieldCheck,
  Clock,
  Pause,
  Play,
  StopCircle,
  AlertTriangle,
  Image as ImageIcon
} from 'lucide-react';
import AddPhoneNumberModal from '../components/AddPhoneNumberModal';

export default function BroadcastPage() {
  const { token } = useAuth();
  
  // Stepped Wizard (1: Contacts & Campaign, 2: Template & Mapping, 3: Review & Schedule, 4: Live Progress)
  const [currentStep, setCurrentStep] = useState(1);

  // Campaign Settings
  const [campaignName, setCampaignName] = useState('');
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [selectedPhoneId, setSelectedPhoneId] = useState('');
  const [showAddPhoneModal, setShowAddPhoneModal] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateSearch, setTemplateSearch] = useState('');
  const [inspectInput, setInspectInput] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const [inspectMessage, setInspectMessage] = useState(null);
  const [headerMediaUrl, setHeaderMediaUrl] = useState('');
  const [headerMediaId, setHeaderMediaId] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaUploadSuccess, setMediaUploadSuccess] = useState(false);
  const [mediaSourceTab, setMediaSourceTab] = useState('upload'); // 'upload' | 'default' | 'url'

  // Dispatch Throttle Delay (in milliseconds)
  const [throttleDelay, setThrottleDelay] = useState(250);
  const [liveDelay, setLiveDelay] = useState(250);
  const [campaignPaused, setCampaignPaused] = useState(false);
  const [updatingThrottle, setUpdatingThrottle] = useState(false);

  // CSV/Excel file state
  const [file, setFile] = useState(null);
  const [parsingFile, setParsingFile] = useState(false);
  const [fileColumns, setFileColumns] = useState([]);
  const [fileRows, setFileRows] = useState([]);
  const [filePreviewRows, setFilePreviewRows] = useState([]);
  const [phoneColumn, setPhoneColumn] = useState('');
  const [nameColumn, setNameColumn] = useState('');
  const [variableMappings, setVariableMappings] = useState({});

  // Recipient Validation Diagnostics
  const [validationStats, setValidationStats] = useState({
    total: 0,
    valid: 0,
    invalid: 0,
    duplicates: 0,
    parsedRecords: []
  });

  // Scheduling
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');

  // Execution & Progress state
  const [sending, setSending] = useState(false);
  const [activeCampaign, setActiveCampaign] = useState(null);
  const [progressStats, setProgressStats] = useState({ total: 0, sent: 0, failed: 0, status: 'IDLE' });
  const [streamLogs, setStreamLogs] = useState([]);
  const [showProgressModal, setShowProgressModal] = useState(false);

  // Preset Configurations for Dispatch Throttle Delay
  const THROTTLE_PRESETS = [
    { label: '⚡ Turbo', ms: 100, hint: '~10 msgs/s' },
    { label: '✅ Recommended', ms: 250, hint: '~4 msgs/s' },
    { label: '⚖️ Balanced', ms: 500, hint: '~2 msgs/s' },
    { label: '🛡️ Safe', ms: 1000, hint: '~1 msg/s' },
    { label: '⏳ Relaxed', ms: 2000, hint: '~0.5 msg/s' }
  ];

  function formatDuration(totalMs) {
    if (!totalMs || totalMs <= 0) return '0s';
    const totalSecs = Math.ceil(totalMs / 1000);
    if (totalSecs < 60) return `${totalSecs}s`;
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
  }

  function getSafetyTier(ms) {
    const num = Number(ms) || 0;
    if (num < 150) {
      return {
        level: 'turbo',
        label: '⚡ Turbo Speed',
        color: '#D97706',
        badgeBg: '#FEF3C7',
        badgeColor: '#92400E',
        badgeBorder: '#FDE68A',
        desc: `High-speed dispatch (~${(1000 / (num || 1)).toFixed(0)} msgs/sec). Recommended for verified Tier 2/3 Meta accounts.`
      };
    } else if (num <= 350) {
      return {
        level: 'optimal',
        label: '✅ Meta Recommended',
        color: '#16A34A',
        badgeBg: '#DCFCE7',
        badgeColor: '#15803D',
        badgeBorder: '#BBF7D0',
        desc: `Optimal throughput (~${(1000 / (num || 1)).toFixed(1)} msgs/sec). Best balance of speed and 100% rate-limit safety.`
      };
    } else if (num <= 800) {
      return {
        level: 'safe',
        label: '🛡️ Safe / Warm-up',
        color: '#2563EB',
        badgeBg: '#DBEAFE',
        badgeColor: '#1E40AF',
        badgeBorder: '#BFDBFE',
        desc: `Conservative pace (~${(1000 / (num || 1)).toFixed(1)} msgs/sec). Ideal for newly registered phone numbers and cold lists.`
      };
    } else {
      return {
        level: 'gentle',
        label: '⏳ Relaxed Pacing',
        color: '#7C3AED',
        badgeBg: '#F3E8FF',
        badgeColor: '#6B21A8',
        badgeBorder: '#E9D5FF',
        desc: `Extended delay (~${(1000 / (num || 1)).toFixed(1)} msgs/sec). Gentle trickle dispatch to preserve account quality.`
      };
    }
  }

  const msgsPerSecond = throttleDelay > 0 ? (1000 / throttleDelay).toFixed(1) : '∞';
  const totalTargetRecipients = validationStats.valid || fileRows.length || 0;
  const estimatedBroadcastDuration = formatDuration(totalTargetRecipients * throttleDelay);
  const currentSafetyTier = getSafetyTier(throttleDelay);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      
      // Load templates
      const tmplRes = await fetch('/api/broadcast/templates', { headers });
      const tmplData = await tmplRes.json();
      const list = tmplData.templates || tmplData.data || [];
      if (list.length > 0) {
        setTemplates(list);
        if (!selectedTemplate) {
          handleSelectTemplate(list[0]);
        }
      }

      // Load registered sender phones
      const phonesRes = await fetch('/api/admin/phone-numbers', { headers });
      const phonesData = await phonesRes.json();
      if (phonesData.success && phonesData.data) {
        setPhoneNumbers(phonesData.data);
        const def = phonesData.data.find(p => p.is_default) || phonesData.data[0];
        if (def && !selectedPhoneId) setSelectedPhoneId(def.id);
      }

      // Load default throttle delay from settings
      try {
        const setRes = await fetch('/api/settings', { headers });
        const setData = await setRes.json();
        const s = setData.settings || setData.data;
        if (s && s.BROADCAST_DELAY_MS) {
          const d = parseInt(s.BROADCAST_DELAY_MS, 10);
          if (!isNaN(d) && d >= 0) {
            setThrottleDelay(d);
            setLiveDelay(d);
          }
        }
      } catch (e) {
        // Fallback default 250ms
      }
    } catch (err) {
      console.error('Failed to load broadcast pre-requisites:', err);
    }
  }

  async function handlePhoneAdded(newPhone) {
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const phonesRes = await fetch('/api/admin/phone-numbers', { headers });
      const phonesData = await phonesRes.json();
      if (phonesData.success && phonesData.data) {
        setPhoneNumbers(phonesData.data);
        if (newPhone?.id) {
          setSelectedPhoneId(newPhone.id);
        } else if (phonesData.data.length > 0) {
          const def = phonesData.data.find(p => p.is_default) || phonesData.data[0];
          setSelectedPhoneId(def.id);
        }
      }
    } catch (err) {
      console.error('Failed to refresh phones:', err);
    }
  }

  function handleSelectTemplate(tmpl) {
    if (!tmpl) return;
    setSelectedTemplate(tmpl);

    // Auto-detect header media from template example if available
    const headerComp = tmpl.components?.find(c => c.type === 'HEADER' && c.format !== 'TEXT');
    if (headerComp) {
      const exampleUrl = headerComp.example?.header_handle?.[0] || '';
      if (exampleUrl) {
        setHeaderMediaUrl(exampleUrl);
        setMediaSourceTab('default');
      } else {
        setHeaderMediaUrl('');
        setMediaSourceTab('upload');
      }
      setHeaderMediaId('');
      setMediaUploadSuccess(false);
    } else {
      setHeaderMediaUrl('');
      setHeaderMediaId('');
      setMediaUploadSuccess(false);
    }

    // Extract body text from components or bodyText property
    const bodyComp = tmpl.components?.find(c => c.type === 'BODY');
    const textToScan = bodyComp?.text || tmpl.bodyText || tmpl.body_text || '';

    const initMap = {};
    if (tmpl.variables && Array.isArray(tmpl.variables) && tmpl.variables.length > 0) {
      tmpl.variables.forEach(v => {
        const key = v.key || String(v.index || '');
        if (key) initMap[key] = '';
      });
    } else if (textToScan) {
      const matches = textToScan.match(/\{\{([a-zA-Z0-9_-]+)\}\}/g) || [];
      matches.forEach(m => {
        const num = m.replace(/[{}]/g, '');
        initMap[num] = '';
      });
    }

    // Auto-map {{1}} or {{name}} if contact column was already selected
    if (nameColumn) {
      if (initMap['1'] !== undefined) initMap['1'] = nameColumn;
      if (initMap['name'] !== undefined) initMap['name'] = nameColumn;
    }
    setVariableMappings(initMap);
  }

  async function handleMediaFileUpload(e) {
    const mediaFile = e.target.files?.[0];
    if (!mediaFile) return;

    setUploadingMedia(true);
    setMediaUploadSuccess(false);

    try {
      const formData = new FormData();
      formData.append('file', mediaFile);

      const res = await fetch('/api/upload/media', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Media upload failed');
      }

      setHeaderMediaUrl(data.url);
      if (data.mediaId) {
        setHeaderMediaId(data.mediaId);
      }
      setMediaUploadSuccess(true);
    } catch (err) {
      alert(`Media upload failed: ${err.message}`);
    } finally {
      setUploadingMedia(false);
    }
  }

  async function handleInspectTemplate(e) {
    if (e) e.preventDefault();
    const inputVal = inspectInput.trim();
    if (!inputVal) return;

    setInspecting(true);
    setInspectMessage(null);
    try {
      const res = await fetch(`/api/templates/${encodeURIComponent(inputVal)}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || `Template '${inputVal}' not found.`);
      }
      const fetchedTmpl = data.data || data.template;
      setTemplates(prev => {
        const existingIdx = prev.findIndex(t => t.name === fetchedTmpl.name || t.id === fetchedTmpl.id || t.meta_id === fetchedTmpl.meta_id);
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = fetchedTmpl;
          return updated;
        }
        return [fetchedTmpl, ...prev];
      });
      handleSelectTemplate(fetchedTmpl);
      setInspectMessage({ type: 'success', text: `✓ Loaded template "${fetchedTmpl.name}" (Language: ${fetchedTmpl.language || 'en'})` });
    } catch (err) {
      setInspectMessage({ type: 'error', text: `✗ ${err.message}` });
    } finally {
      setInspecting(false);
    }
  }

  // Robust Excel (.xlsx, .xls) and CSV parser powered by SheetJS /api/upload
  async function handleFileUpload(e) {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setParsingFile(true);

    try {
      const formData = new FormData();
      formData.append('file', uploadedFile);

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to parse file');
      }

      const d = result.data;
      setFileColumns(d.columns || []);
      setPhoneColumn(d.detectedPhoneCol || (d.columns?.[0] || ''));
      setNameColumn(d.detectedNameCol || '');
      setFileRows(d.allRows || []);
      setFilePreviewRows(d.preview || []);

      setValidationStats({
        total: d.totalRows || 0,
        valid: d.validRows || 0,
        invalid: d.invalidRows || 0,
        duplicates: d.duplicateRows || 0,
        parsedRecords: d.preview || []
      });

      // Auto-set campaign name if empty or generic
      const rawBase = (d.filename || uploadedFile.name).replace(/\.[^/.]+$/, '');
      if (!campaignName || campaignName.includes('Broadcast')) {
        setCampaignName(`${rawBase} Broadcast - ${new Date().toLocaleDateString()}`);
      }

      // Auto-map template variable {{1}} to detected name column
      if (d.detectedNameCol) {
        setVariableMappings(prev => {
          if (prev['1'] !== undefined) {
            return { ...prev, '1': d.detectedNameCol };
          }
          return prev;
        });
      }
    } catch (err) {
      console.error('File parse error:', err);
      alert('Failed to parse file: ' + err.message);
    } finally {
      setParsingFile(false);
    }
  }

  // Prepare sample data for smartphone mockup
  const sampleDataForMockup = {};
  if (validationStats.parsedRecords.length > 0) {
    const firstRow = validationStats.parsedRecords[0];
    const rowData = firstRow.data || firstRow;
    Object.keys(variableMappings).forEach(varNum => {
      const col = variableMappings[varNum];
      sampleDataForMockup[varNum] = col && rowData[col] ? rowData[col] : `Sample ${varNum}`;
    });
  } else {
    sampleDataForMockup['1'] = 'Rahul Sharma';
    sampleDataForMockup['2'] = 'Konkan Luxury Villa';
    sampleDataForMockup['3'] = '15 Oct 2026';
  }

  // Execute or schedule campaign
  async function handleLaunchBroadcast(e) {
    if (e) e.preventDefault();
    if (!file) {
      alert('Please upload a recipient contact file (CSV/Excel).');
      return;
    }
    if (!selectedTemplate) {
      alert('Please select an approved WhatsApp template.');
      return;
    }

    setSending(true);
    setShowProgressModal(true);
    setProgressStats({ total: validationStats.valid || fileRows.length || 1, sent: 0, failed: 0, status: 'STARTING' });
    setStreamLogs([{ time: new Date().toLocaleTimeString(), text: 'Validating payload, Meta template & consent parameters...' }]);

    const formData = new FormData();
    formData.append('campaignName', campaignName || `Broadcast_${new Date().toLocaleDateString()}`);
    formData.append('file', file);
    formData.append('templateName', selectedTemplate.name);
    formData.append('templateLang', selectedTemplate.language || 'en');
    formData.append('phoneColumn', phoneColumn);
    if (nameColumn) formData.append('nameColumn', nameColumn);
    formData.append('variableMappings', JSON.stringify(variableMappings));
    if (selectedPhoneId) formData.append('phoneId', selectedPhoneId);
    if (headerMediaUrl) formData.append('headerMediaUrl', headerMediaUrl);
    if (headerMediaId) formData.append('headerMediaId', headerMediaId);
    if (isScheduled && scheduledTime) formData.append('scheduledTime', scheduledTime);
    formData.append('delayMs', String(throttleDelay));

    setLiveDelay(throttleDelay);
    setCampaignPaused(false);

    try {
      const res = await fetch('/api/broadcast/send', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Broadcast launch failed');
      }

      setActiveCampaign(data.campaignId);
      setProgressStats(prev => ({ ...prev, status: 'IN_PROGRESS', total: data.totalRecipients || prev.total }));
      setStreamLogs(prev => [
        ...prev,
        { time: new Date().toLocaleTimeString(), text: `Campaign #${data.campaignId} created with ${throttleDelay}ms pacing! Initializing real-time SSE telemetry...` }
      ]);

      // Connect to SSE stream for live progress
      connectSSEStream(data.campaignId);
    } catch (err) {
      setProgressStats(prev => ({ ...prev, status: 'FAILED' }));
      setStreamLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), text: `Error: ${err.message}` }]);
    } finally {
      setSending(false);
    }
  }

  function connectSSEStream(campaignId) {
    try {
      const eventSource = new EventSource(`/api/broadcast/stream?campaignId=${campaignId}&token=${token}`);
      
      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const type = (payload.type || payload.TYPE || '').toUpperCase();
          
          if (type === 'PROGRESS') {
            setProgressStats(prev => ({
              ...prev,
              sent: payload.sent !== undefined ? payload.sent : prev.sent,
              failed: payload.failed !== undefined ? payload.failed : prev.failed,
              total: payload.total !== undefined ? payload.total : prev.total,
              status: payload.status || prev.status
            }));
            if (payload.delayMs !== undefined) {
              setLiveDelay(payload.delayMs);
            }
            if (payload.lastRecipient) {
              setStreamLogs(prev => [
                { time: new Date().toLocaleTimeString(), text: `Sent to ${payload.lastRecipient} (Meta ID: ${payload.metaMessageId || 'OK'})` },
                ...prev.slice(0, 50)
              ]);
            }
          } else if (type === 'THROTTLE') {
            if (payload.delayMs !== undefined) {
              setLiveDelay(payload.delayMs);
              setStreamLogs(prev => [
                { time: new Date().toLocaleTimeString(), text: `⚡ Dispatch throttle adjusted to ${payload.delayMs}ms` },
                ...prev.slice(0, 50)
              ]);
            }
          } else if (type === 'STATUS') {
            if (payload.status) {
              setProgressStats(prev => ({ ...prev, status: payload.status }));
              setCampaignPaused(payload.status === 'PAUSED');
              setStreamLogs(prev => [
                { time: new Date().toLocaleTimeString(), text: `Status update: ${payload.status} - ${payload.message || ''}` },
                ...prev.slice(0, 50)
              ]);
            }
          } else if (type === 'COMPLETED') {
            setProgressStats(prev => ({ ...prev, status: 'COMPLETED' }));
            setStreamLogs(prev => [
              { time: new Date().toLocaleTimeString(), text: '🎉 All messages dispatched to Meta Cloud API successfully!' },
              ...prev
            ]);
            eventSource.close();
          }
        } catch (e) {}
      };

      eventSource.onerror = () => {
        eventSource.close();
      };
    } catch (e) {
      console.warn('SSE stream fallback:', e);
    }
  }

  // Live adjustments during active broadcast
  async function handleLiveThrottleChange(newMs) {
    const val = Math.max(0, parseInt(newMs, 10) || 0);
    setLiveDelay(val);
    if (!activeCampaign) return;
    try {
      setUpdatingThrottle(true);
      await fetch(`/api/campaigns/${activeCampaign}/throttle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ delayMs: val })
      });
    } catch (e) {
      console.warn('Failed to update live throttle:', e);
    } finally {
      setUpdatingThrottle(false);
    }
  }

  async function handleTogglePauseCampaign() {
    if (!activeCampaign) return;
    try {
      const endpoint = campaignPaused
        ? `/api/campaigns/${activeCampaign}/resume`
        : `/api/campaigns/${activeCampaign}/pause`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ delayMs: liveDelay })
      });
      const data = await res.json();
      if (data.success) {
        const nextState = !campaignPaused;
        setCampaignPaused(nextState);
        setProgressStats(prev => ({ ...prev, status: nextState ? 'PAUSED' : 'RUNNING' }));
        setStreamLogs(prev => [
          { time: new Date().toLocaleTimeString(), text: nextState ? '⏸️ Campaign paused by operator.' : '▶️ Campaign resumed.' },
          ...prev.slice(0, 50)
        ]);
      } else {
        alert(data.message || 'Operation failed');
      }
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleCancelCampaign() {
    if (!activeCampaign) return;
    if (!confirm('Are you sure you want to stop and cancel this broadcast?')) return;
    try {
      const res = await fetch(`/api/campaigns/${activeCampaign}/cancel`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.success) {
        setProgressStats(prev => ({ ...prev, status: 'CANCELLED' }));
        setStreamLogs(prev => [
          { time: new Date().toLocaleTimeString(), text: '🛑 Campaign cancelled by operator.' },
          ...prev
        ]);
      }
    } catch (e) {
      alert(e.message);
    }
  }

  const steps = [
    { number: 1, title: 'Audience & Campaign' },
    { number: 2, title: 'Template & Mapping' },
    { number: 3, title: 'Preview & Schedule' },
  ];

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '28px 24px' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
          WhatsApp Broadcast Studio
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
          Target customer lists with official Meta-approved templates, variable tag mapping, and live smartphone preview.
        </p>
      </div>

      {/* Stepped Progress Indicator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#FFFFFF',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        padding: '16px 24px',
        marginBottom: '28px',
        boxShadow: 'var(--shadow-xs)'
      }}>
        {steps.map((st, idx) => {
          const isActive = currentStep === st.number;
          const isDone = currentStep > st.number;
          return (
            <React.Fragment key={st.number}>
              <div 
                onClick={() => {
                  if (st.number === 1 || (st.number === 2 && file) || (st.number === 3 && file && selectedTemplate)) {
                    setCurrentStep(st.number);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  cursor: 'pointer'
                }}
              >
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: isDone ? '#16A34A' : isActive ? 'var(--brand-wa)' : '#F1F5F9',
                  color: isDone || isActive ? '#FFFFFF' : '#64748B',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: isActive ? '0 0 0 3px rgba(18, 140, 126, 0.15)' : 'none'
                }}>
                  {isDone ? <CheckCircle2 size={16} /> : st.number}
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>
                    Step {st.number}
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: isActive ? '#0F172A' : '#64748B' }}>
                    {st.title}
                  </div>
                </div>
              </div>

              {idx < steps.length - 1 && (
                <div style={{
                  flex: 1,
                  height: '2px',
                  background: currentStep > st.number ? '#16A34A' : '#E2E8F0',
                  margin: '0 20px'
                }} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Main Form Body & Right Preview Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(340px, 0.85fr)', gap: '28px', alignItems: 'start' }}>
        {/* Left Wizard Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* STEP 1: Audience & Campaign Details */}
          {currentStep === 1 && (
            <div className="saas-card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <Layers size={18} color="var(--brand-wa)" /> Campaign Details & Recipient Contact File
                </h2>
                <a
                  href="/Sample_WhatsApp_Contacts.xlsx"
                  download="Sample_WhatsApp_Contacts.xlsx"
                  className="btn btn-secondary"
                  style={{
                    fontSize: '0.78rem',
                    padding: '6px 12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    textDecoration: 'none',
                    color: '#334155'
                  }}
                  title="Download verified sample Excel file template"
                >
                  <Download size={14} color="var(--brand-wa)" />
                  <span>Download Demo Excel</span>
                </a>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Campaign Name <span style={{ color: 'var(--error)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="saas-input"
                    placeholder="e.g. Diwali Weekend Promo 2026"
                    value={campaignName}
                    onChange={e => setCampaignName(e.target.value)}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                      WhatsApp Sender Line <span style={{ color: 'var(--error)' }}>*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowAddPhoneModal(true)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--brand-wa)',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: 0
                      }}
                    >
                      <Plus size={13} />
                      <span>Add Line</span>
                    </button>
                  </div>
                  {phoneNumbers.length === 0 ? (
                    <div style={{
                      background: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px'
                    }}>
                      <span style={{ fontSize: '0.78rem', color: '#166534', fontWeight: 500 }}>
                        No WhatsApp line connected yet.
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAddPhoneModal(true)}
                        className="btn btn-action-green"
                        style={{ padding: '4px 10px', fontSize: '0.72rem', whiteSpace: 'nowrap' }}
                      >
                        + Connect Line
                      </button>
                    </div>
                  ) : (
                    <select
                      className="saas-input"
                      value={selectedPhoneId}
                      onChange={e => setSelectedPhoneId(e.target.value)}
                    >
                      {phoneNumbers.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.display_name} ({p.phone_number}) {p.is_default ? '★ Primary' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Quick Dispatch Throttle Selector in Step 1 */}
              <div style={{
                background: '#F8FAFC',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '12px 16px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--brand-wa)'
                  }}>
                    <Zap size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.825rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>Dispatch Throttle Delay:</span>
                      <span style={{ color: 'var(--brand-wa)', fontWeight: 800 }}>{throttleDelay} ms</span>
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: currentSafetyTier.badgeBg,
                        color: currentSafetyTier.badgeColor,
                        border: `1px solid ${currentSafetyTier.badgeBorder}`
                      }}>
                        {currentSafetyTier.label}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.725rem', color: '#64748B' }}>
                      Rate: ~{msgsPerSecond} msgs/sec • Fully adjustable with live estimator in Step 3 before starting
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {THROTTLE_PRESETS.map(p => (
                    <button
                      key={p.ms}
                      type="button"
                      onClick={() => setThrottleDelay(p.ms)}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        border: throttleDelay === p.ms ? '1.5px solid var(--brand-wa)' : '1px solid #CBD5E1',
                        background: throttleDelay === p.ms ? '#F0FDF4' : '#FFFFFF',
                        color: throttleDelay === p.ms ? '#15803D' : '#475569',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recipient File Upload Area */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Upload Contact Audience (Excel / CSV) <span style={{ color: 'var(--error)' }}>*</span>
                </label>
                <div style={{
                  border: '2px dashed var(--border-color)',
                  borderRadius: '10px',
                  padding: '24px',
                  textAlign: 'center',
                  background: parsingFile ? '#F0FDF4' : '#F8FAFC',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background 0.2s ease'
                }}>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileUpload}
                    disabled={parsingFile}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      opacity: 0,
                      cursor: 'pointer'
                    }}
                  />
                  <UploadCloud size={32} color="var(--brand-wa)" style={{ margin: '0 auto 8px auto' }} />
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0F172A' }}>
                    {parsingFile ? 'Parsing Excel/CSV with SheetJS...' : (file ? file.name : 'Drag & drop Excel or CSV file here, or click to browse')}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
                    Supports official .xlsx, .xls, and .csv up to 25MB (e.g., Name, Phone, City, Offer columns)
                  </div>
                </div>
              </div>

              {/* Validation Summary Box */}
              {validationStats.total > 0 && (
                <div style={{
                  background: '#FFFFFF',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '16px',
                  marginBottom: '20px'
                }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileCheck size={16} color="#16A34A" /> Import Validation Summary
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ background: '#F8FAFC', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>{validationStats.total}</div>
                      <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Total Contacts</div>
                    </div>
                    <div style={{ background: '#DCFCE7', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#15803D' }}>{validationStats.valid}</div>
                      <div style={{ fontSize: '0.7rem', color: '#15803D' }}>Valid Phone Numbers</div>
                    </div>
                    <div style={{ background: '#FEF3C7', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#B45309' }}>{validationStats.duplicates}</div>
                      <div style={{ fontSize: '0.7rem', color: '#B45309' }}>Duplicates Suppressed</div>
                    </div>
                    <div style={{ background: '#FEE2E2', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#DC2626' }}>{validationStats.invalid}</div>
                      <div style={{ fontSize: '0.7rem', color: '#DC2626' }}>Invalid Numbers</div>
                    </div>
                  </div>

                  {/* Column Selectors */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <label style={{ fontSize: '0.775rem', fontWeight: 600, color: '#334155' }}>
                          WhatsApp Phone Number Column
                        </label>
                        <span style={{ fontSize: '0.65rem', background: '#DCFCE7', color: '#15803D', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                          Auto-Detected
                        </span>
                      </div>
                      <select
                        className="saas-input"
                        value={phoneColumn}
                        onChange={e => setPhoneColumn(e.target.value)}
                      >
                        {fileColumns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <label style={{ fontSize: '0.775rem', fontWeight: 600, color: '#334155' }}>
                          Contact / Customer Name Column
                        </label>
                        <span style={{ fontSize: '0.65rem', background: '#DCFCE7', color: '#15803D', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                          Auto-Detected
                        </span>
                      </div>
                      <select
                        className="saas-input"
                        value={nameColumn}
                        onChange={e => {
                          setNameColumn(e.target.value);
                          if (variableMappings['1'] !== undefined) {
                            setVariableMappings(prev => ({ ...prev, '1': e.target.value }));
                          }
                        }}
                      >
                        <option value="">-- No Name Column --</option>
                        {fileColumns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* First 10 Contacts Preview Table */}
                  {filePreviewRows.length > 0 && (
                    <div style={{ marginTop: '16px' }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '8px'
                      }}>
                        <div style={{ fontSize: '0.825rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Table size={15} color="var(--brand-wa)" />
                          <span>First 10 Contacts Preview</span>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                          {file?.name}
                        </span>
                      </div>

                      <div style={{
                        overflowX: 'auto',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        background: '#FFFFFF'
                      }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border-color)', color: '#475569', fontWeight: 600 }}>
                              <th style={{ padding: '8px 12px', width: '40px' }}>#</th>
                              <th style={{ padding: '8px 12px' }}>Contact Name</th>
                              <th style={{ padding: '8px 12px' }}>Raw Phone</th>
                              <th style={{ padding: '8px 12px' }}>Cleaned Phone (+Country)</th>
                              <th style={{ padding: '8px 12px' }}>Validation Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filePreviewRows.slice(0, 10).map((row, idx) => {
                              const rawP = phoneColumn && row.data ? row.data[phoneColumn] : (row.rawPhone || '—');
                              const nameVal = nameColumn && row.data ? row.data[nameColumn] : (row.contactName || '—');
                              const cleanP = row.cleanPhone || '—';
                              return (
                                <tr key={idx} style={{ borderBottom: idx < filePreviewRows.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                                  <td style={{ padding: '8px 12px', color: '#94A3B8' }}>{idx + 1}</td>
                                  <td style={{ padding: '8px 12px', fontWeight: 600, color: '#0F172A' }}>{nameVal || '—'}</td>
                                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#475569' }}>{rawP || '—'}</td>
                                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#0F172A', fontWeight: 600 }}>{cleanP || '—'}</td>
                                  <td style={{ padding: '8px 12px' }}>
                                    {row.isValid ? (
                                      <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        background: '#DCFCE7',
                                        color: '#15803D',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontSize: '0.72rem',
                                        fontWeight: 600
                                      }}>
                                        ✓ Valid
                                      </span>
                                    ) : row.isDuplicate ? (
                                      <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        background: '#FEF3C7',
                                        color: '#B45309',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontSize: '0.72rem',
                                        fontWeight: 600
                                      }}>
                                        🔁 Duplicate
                                      </span>
                                    ) : (
                                      <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        background: '#FEE2E2',
                                        color: '#DC2626',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontSize: '0.72rem',
                                        fontWeight: 600
                                      }}>
                                        ✗ {row.validationNote || 'Invalid'}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Next Step Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (!file) {
                      alert('Please upload a recipient contact file first.');
                      return;
                    }
                    setCurrentStep(2);
                  }}
                  className="btn btn-primary"
                >
                  <span>Continue to Template Selection</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Template Selection & Variable Mapping */}
          {currentStep === 2 && (
            <div className="saas-card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <Layers size={18} color="var(--brand-wa)" /> Select Official Meta Template
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="badge badge-success">
                    {templates.length} Approved Templates
                  </span>
                  <button
                    type="button"
                    onClick={loadData}
                    className="btn btn-secondary"
                    style={{ padding: '5px 10px', fontSize: '0.75rem', gap: '4px' }}
                    title="Refresh templates from database"
                  >
                    <RefreshCw size={12} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* Template Search & Live Meta Inspector */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '12px', color: '#94A3B8' }} />
                  <input
                    type="text"
                    placeholder="Filter templates by name or category..."
                    className="saas-input"
                    style={{ paddingLeft: '32px' }}
                    value={templateSearch}
                    onChange={e => setTemplateSearch(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '6px', flex: 1.2, minWidth: '280px' }}>
                  <input
                    type="text"
                    placeholder="Paste Meta Template ID or Name..."
                    className="saas-input"
                    value={inspectInput}
                    onChange={e => setInspectInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleInspectTemplate(e); }}
                  />
                  <button
                    type="button"
                    onClick={handleInspectTemplate}
                    disabled={inspecting || !inspectInput.trim()}
                    className="btn btn-secondary"
                    style={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}
                  >
                    <Search size={14} className={inspecting ? 'pulse-glow' : ''} />
                    <span>{inspecting ? 'Inspecting...' : 'Inspect & Add'}</span>
                  </button>
                </div>
              </div>

              {inspectMessage && (
                <div style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  marginBottom: '14px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  background: inspectMessage.type === 'success' ? '#DCFCE7' : '#FEE2E2',
                  color: inspectMessage.type === 'success' ? '#15803D' : '#DC2626',
                  border: `1px solid ${inspectMessage.type === 'success' ? '#BBF7D0' : '#FECACA'}`
                }}>
                  {inspectMessage.text}
                </div>
              )}

              {/* Template Picker Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '12px',
                maxHeight: '260px',
                overflowY: 'auto',
                padding: '4px',
                marginBottom: '16px'
              }}>
                {templates
                  .filter(tmpl => {
                    if (!templateSearch.trim()) return true;
                    const q = templateSearch.toLowerCase();
                    return (
                      tmpl.name?.toLowerCase().includes(q) ||
                      tmpl.category?.toLowerCase().includes(q) ||
                      tmpl.meta_id?.toString().includes(q)
                    );
                  })
                  .map(tmpl => {
                    const isSelected = selectedTemplate?.name === tmpl.name;
                    return (
                      <div
                        key={tmpl.name}
                        onClick={() => handleSelectTemplate(tmpl)}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '8px',
                          border: '1px solid',
                          borderColor: isSelected ? 'var(--brand-wa)' : 'var(--border-color)',
                          background: isSelected ? '#F0FDF4' : '#FFFFFF',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          boxShadow: isSelected ? '0 0 0 2px rgba(18, 140, 126, 0.2)' : 'var(--shadow-xs)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: isSelected ? '#0d7064' : '#0F172A' }}>
                            {tmpl.name}
                          </span>
                          <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>
                            {tmpl.language || 'en'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          Category: {tmpl.category || 'MARKETING'} • Status: {tmpl.status || 'APPROVED'}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Selected Template Details Card */}
              {selectedTemplate && (
                <div style={{
                  background: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  marginBottom: '18px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CheckCircle2 size={16} color="#15803D" />
                      <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#15803D' }}>
                        {selectedTemplate.name}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        (Meta ID: <code>{selectedTemplate.meta_id || selectedTemplate.id || 'N/A'}</code>)
                      </span>
                    </div>
                    <span className="badge badge-success" style={{ fontSize: '0.68rem' }}>
                      {selectedTemplate.status || 'APPROVED'} • {selectedTemplate.language || 'en'}
                    </span>
                  </div>
                  {selectedTemplate.bodyText && (
                    <div style={{
                      fontSize: '0.78rem',
                      color: '#334155',
                      whiteSpace: 'pre-wrap',
                      background: '#FFFFFF',
                      padding: '10px',
                      borderRadius: '6px',
                      border: '1px solid #E2E8F0',
                      maxHeight: '120px',
                      overflowY: 'auto'
                    }}>
                      {selectedTemplate.bodyText}
                    </div>
                  )}
                </div>
              )}

              {/* Dynamic Variable Mappings */}
              {selectedTemplate && Object.keys(variableMappings).length > 0 && (
                <div style={{
                  background: '#F8FAFC',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '18px',
                  marginBottom: '20px'
                }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
                    Map Dynamic Personalization Variables
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '14px' }}>
                    Match each template variable tag with a column from your uploaded contact sheet.
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                    {Object.keys(variableMappings).map(varNum => (
                      <div key={varNum}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                          Variable &#123;&#123;{varNum}&#125;&#125;
                        </label>
                        <select
                          className="saas-input"
                          value={variableMappings[varNum] || ''}
                          onChange={e => setVariableMappings(prev => ({ ...prev, [varNum]: e.target.value }))}
                        >
                          <option value="">-- Choose Sheet Column --</option>
                          {fileColumns.map(col => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Header Media Manager (Image / Document / Video) */}
              {selectedTemplate?.components?.some(c => c.type === 'HEADER' && c.format !== 'TEXT') && (() => {
                const headerComp = selectedTemplate.components.find(c => c.type === 'HEADER');
                const mediaFormat = (headerComp?.format || 'IMAGE').toUpperCase();
                const templateExampleUrl = headerComp?.example?.header_handle?.[0] || '';

                return (
                  <div style={{
                    marginBottom: '24px',
                    background: '#F8FAFC',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    padding: '18px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ImageIcon size={18} color="var(--brand-wa)" />
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A' }}>
                          Template Header Media ({mediaFormat})
                        </span>
                        <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                          Meta Required
                        </span>
                      </div>

                      {/* Source Selection Buttons */}
                      <div style={{ display: 'flex', background: '#E2E8F0', padding: '3px', borderRadius: '8px', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => setMediaSourceTab('upload')}
                          style={{
                            padding: '4px 10px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            borderRadius: '6px',
                            border: 'none',
                            background: mediaSourceTab === 'upload' ? '#FFFFFF' : 'transparent',
                            color: mediaSourceTab === 'upload' ? '#0F172A' : '#64748B',
                            cursor: 'pointer',
                            boxShadow: mediaSourceTab === 'upload' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                          }}
                        >
                          Upload File
                        </button>
                        {templateExampleUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setMediaSourceTab('default');
                              setHeaderMediaUrl(templateExampleUrl);
                              setHeaderMediaId('');
                            }}
                            style={{
                              padding: '4px 10px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              borderRadius: '6px',
                              border: 'none',
                              background: mediaSourceTab === 'default' ? '#FFFFFF' : 'transparent',
                              color: mediaSourceTab === 'default' ? '#0F172A' : '#64748B',
                              cursor: 'pointer',
                              boxShadow: mediaSourceTab === 'default' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                            }}
                          >
                            Template Default
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setMediaSourceTab('url')}
                          style={{
                            padding: '4px 10px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            borderRadius: '6px',
                            border: 'none',
                            background: mediaSourceTab === 'url' ? '#FFFFFF' : 'transparent',
                            color: mediaSourceTab === 'url' ? '#0F172A' : '#64748B',
                            cursor: 'pointer',
                            boxShadow: mediaSourceTab === 'url' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                          }}
                        >
                          Web URL
                        </button>
                      </div>
                    </div>

                    {/* Tab 1: Direct File Upload */}
                    {mediaSourceTab === 'upload' && (
                      <div>
                        <div style={{
                          border: '2px dashed #CBD5E1',
                          borderRadius: '10px',
                          padding: '20px',
                          textAlign: 'center',
                          background: '#FFFFFF',
                          cursor: 'pointer',
                          transition: 'border-color 0.2s ease',
                          position: 'relative'
                        }}>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4"
                            onChange={handleMediaFileUpload}
                            disabled={uploadingMedia}
                            style={{
                              position: 'absolute',
                              inset: 0,
                              opacity: 0,
                              cursor: 'pointer',
                              width: '100%',
                              height: '100%'
                            }}
                          />
                          <UploadCloud size={30} color={uploadingMedia ? 'var(--brand-wa)' : '#94A3B8'} style={{ margin: '0 auto 8px auto' }} />
                          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155' }}>
                            {uploadingMedia ? 'Uploading to Server & Meta Cloud...' : 'Click to choose image file or drag here'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '4px' }}>
                            JPG, PNG, WEBP, PDF up to 25MB. Uploads directly to Meta Cloud API.
                          </div>
                        </div>

                        {mediaUploadSuccess && (
                          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#16A34A', fontWeight: 600 }}>
                            <CheckCircle2 size={15} /> Media uploaded & synchronized with Meta!
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tab 2: Template Default Image */}
                    {mediaSourceTab === 'default' && (
                      <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.825rem', color: '#475569', marginBottom: '8px' }}>
                          Using the verified sample image registered with Meta for this template:
                        </div>
                        {templateExampleUrl && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <img
                              src={templateExampleUrl}
                              alt="Template default"
                              style={{ width: '80px', height: '60px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #E2E8F0' }}
                            />
                            <div style={{ fontSize: '0.75rem', color: '#64748B', wordBreak: 'break-all' }}>
                              {templateExampleUrl.substring(0, 70)}...
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tab 3: Web URL */}
                    {mediaSourceTab === 'url' && (
                      <div>
                        <input
                          type="url"
                          className="saas-input"
                          placeholder="https://yourdomain.com/images/banner.jpg"
                          value={headerMediaUrl}
                          onChange={e => {
                            setHeaderMediaUrl(e.target.value);
                            setHeaderMediaId('');
                          }}
                          style={{ fontSize: '0.85rem' }}
                        />
                        {headerMediaUrl && (headerMediaUrl.includes('photos.app.goo.gl') || headerMediaUrl.includes('photos.google.com')) && (
                          <div style={{ marginTop: '8px', padding: '8px 12px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '6px', color: '#B45309', fontSize: '0.75rem' }}>
                            ⚠️ <strong>Notice:</strong> Google Photos album links are web pages, not direct image files. We recommend clicking <strong>Upload File</strong> above to upload your image file directly.
                          </div>
                        )}
                      </div>
                    )}

                    {/* Live Thumbnail Preview if a URL is active */}
                    {headerMediaUrl && (
                      <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '12px', background: '#FFFFFF', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                        <img
                          src={headerMediaUrl}
                          alt="Header media preview"
                          onError={(e) => { e.target.style.display = 'none'; }}
                          style={{ width: '64px', height: '48px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #E2E8F0' }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            Active Header Media
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {headerMediaId ? `Meta Media ID: ${headerMediaId}` : headerMediaUrl}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setHeaderMediaUrl('');
                            setHeaderMediaId('');
                            setMediaUploadSuccess(false);
                          }}
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Navigation Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="btn btn-secondary"
                >
                  <ChevronLeft size={16} />
                  <span>Back to Contacts</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="btn btn-primary"
                >
                  <span>Review & Schedule</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Review, Consent & Scheduling */}
          {currentStep === 3 && (
            <div className="saas-card" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} color="var(--brand-wa)" /> Review, Consent & Scheduling
              </h2>

              {/* Campaign Summary Card */}
              <div style={{
                background: '#F8FAFC',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '18px',
                marginBottom: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                fontSize: '0.85rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px' }}>
                  <span style={{ color: '#64748B' }}>Campaign Name:</span>
                  <span style={{ fontWeight: 700, color: '#0F172A' }}>{campaignName || 'Unnamed Broadcast'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px' }}>
                  <span style={{ color: '#64748B' }}>Template:</span>
                  <span style={{ fontWeight: 700, color: '#128C7E' }}>{selectedTemplate?.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px' }}>
                  <span style={{ color: '#64748B' }}>Valid Recipients:</span>
                  <span style={{ fontWeight: 700, color: '#15803D' }}>{validationStats.valid || fileRows.length} Contacts</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px' }}>
                  <span style={{ color: '#64748B' }}>Dispatch Throttle:</span>
                  <span style={{ fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: 'var(--brand-wa)' }}>{throttleDelay} ms</span>
                    <span style={{ fontSize: '0.75rem', color: '#16A34A', fontWeight: 600 }}>({msgsPerSecond} msg/s • Est. ~{estimatedBroadcastDuration})</span>
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Duplicates Suppressed:</span>
                  <span style={{ fontWeight: 600, color: '#B45309' }}>{validationStats.duplicates} Contacts</span>
                </div>
              </div>

              {/* Dedicated Dispatch Throttle Delay Control Card */}
              <div style={{
                background: '#FFFFFF',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '20px',
                boxShadow: 'var(--shadow-xs)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      background: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--brand-wa)'
                    }}>
                      <Sliders size={18} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '0.975rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                        Dispatch Throttle Delay & Pacing Control
                      </h3>
                      <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>
                        Set the spacing in milliseconds between each message before starting the broadcast
                      </div>
                    </div>
                  </div>

                  <div style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: '999px',
                    background: currentSafetyTier.badgeBg,
                    color: currentSafetyTier.badgeColor,
                    border: `1px solid ${currentSafetyTier.badgeBorder}`
                  }}>
                    {currentSafetyTier.label}
                  </div>
                </div>

                {/* Preset Speed Buttons */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>
                    Recommended Delay Presets:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
                    {THROTTLE_PRESETS.map(p => {
                      const isSel = throttleDelay === p.ms;
                      return (
                        <button
                          key={p.ms}
                          type="button"
                          onClick={() => setThrottleDelay(p.ms)}
                          style={{
                            padding: '10px 8px',
                            borderRadius: '8px',
                            border: isSel ? '2px solid var(--brand-wa)' : '1px solid #CBD5E1',
                            background: isSel ? '#F0FDF4' : '#F8FAFC',
                            color: isSel ? '#15803D' : '#334155',
                            cursor: 'pointer',
                            textAlign: 'center',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{p.label}</div>
                          <div style={{ fontSize: '0.675rem', color: isSel ? '#166534' : '#64748B', marginTop: '2px' }}>
                            {p.ms} ms ({p.hint})
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Slider + Manual Number Input */}
                <div style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '16px',
                  marginBottom: '16px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <label htmlFor="step3ThrottleSlider" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                      Adjust Dispatch Delay:
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        step="25"
                        value={throttleDelay}
                        onChange={e => setThrottleDelay(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="saas-input"
                        style={{
                          width: '95px',
                          padding: '5px 8px',
                          fontSize: '0.875rem',
                          fontWeight: 700,
                          textAlign: 'right'
                        }}
                      />
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B' }}>ms</span>
                    </div>
                  </div>

                  <input
                    id="step3ThrottleSlider"
                    type="range"
                    min="50"
                    max="3000"
                    step="25"
                    value={Math.min(3000, Math.max(50, throttleDelay))}
                    onChange={e => setThrottleDelay(parseInt(e.target.value, 10))}
                    style={{
                      width: '100%',
                      height: '6px',
                      borderRadius: '999px',
                      accentColor: 'var(--brand-wa)',
                      cursor: 'pointer'
                    }}
                  />

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94A3B8', marginTop: '6px' }}>
                    <span>50ms (Ultra Fast)</span>
                    <span>250ms (Optimal)</span>
                    <span>500ms (Safe)</span>
                    <span>1000ms</span>
                    <span>3000ms (Gentle)</span>
                  </div>
                </div>

                {/* Calculated Metrics Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '14px' }}>
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '10px 12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Dispatch Speed</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                      ~{msgsPerSecond} <span style={{ fontSize: '0.72rem', fontWeight: 500, color: '#64748B' }}>msgs/sec</span>
                    </div>
                  </div>

                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '10px 12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Est. Total Duration</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--brand-wa)', marginTop: '2px' }}>
                      ~{estimatedBroadcastDuration}
                    </div>
                  </div>

                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '10px 12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Target Recipients</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                      {totalTargetRecipients} <span style={{ fontSize: '0.72rem', fontWeight: 500, color: '#64748B' }}>contacts</span>
                    </div>
                  </div>
                </div>

                {/* Safety Recommendation Notice */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '0.775rem',
                  color: currentSafetyTier.badgeColor,
                  background: currentSafetyTier.badgeBg,
                  border: `1px solid ${currentSafetyTier.badgeBorder}`,
                  padding: '10px 14px',
                  borderRadius: '8px'
                }}>
                  <ShieldCheck size={16} style={{ flexShrink: 0 }} />
                  <div>{currentSafetyTier.desc}</div>
                </div>
              </div>

              {/* Scheduling Options */}
              <div style={{
                background: '#FFFFFF',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '18px',
                marginBottom: '20px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <input
                    type="checkbox"
                    id="scheduleToggle"
                    checked={isScheduled}
                    onChange={e => setIsScheduled(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--brand-wa)', cursor: 'pointer' }}
                  />
                  <label htmlFor="scheduleToggle" style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A', cursor: 'pointer' }}>
                    Schedule for Future Dispatch
                  </label>
                </div>

                {isScheduled && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                      Dispatch Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      className="saas-input"
                      value={scheduledTime}
                      onChange={e => setScheduledTime(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Platform Consent Disclaimer */}
              <div style={{
                background: '#EFF6FF',
                border: '1px solid #BFDBFE',
                borderRadius: '8px',
                padding: '14px',
                fontSize: '0.78rem',
                color: '#1E40AF',
                lineHeight: 1.5,
                marginBottom: '24px',
                display: 'flex',
                gap: '10px'
              }}>
                <Info size={18} style={{ flexShrink: 0 }} />
                <div>
                  <strong>Meta WhatsApp Cloud API Compliance:</strong> Outbound messages require recipient opt-in consent. Unsolicited spam violates Meta policies and will lead to WhatsApp Business Account tier downgrades.
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="btn btn-secondary"
                >
                  <ChevronLeft size={16} />
                  <span>Back to Template</span>
                </button>

                <button
                  type="button"
                  onClick={handleLaunchBroadcast}
                  disabled={sending}
                  className="btn btn-action-green"
                  style={{ padding: '10px 24px', fontSize: '0.925rem' }}
                >
                  <Send size={16} />
                  <span>{isScheduled ? 'Confirm & Schedule Campaign' : 'Confirm & Launch Broadcast Now'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Live WhatsApp Smartphone Handset */}
        <div style={{ position: 'sticky', top: '90px' }}>
          <div style={{ marginBottom: '12px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Live WhatsApp Handset Preview
            </span>
          </div>

          <PhoneMockup
            template={selectedTemplate}
            sampleData={sampleDataForMockup}
            mediaUrl={headerMediaUrl}
          />
        </div>
      </div>

      {/* Real-time SSE Progress & Execution Modal */}
      {showProgressModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            maxWidth: '640px',
            width: '100%',
            padding: '28px',
            boxShadow: 'var(--shadow-xl)',
            border: '1px solid var(--border-color)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: progressStats.status === 'COMPLETED' ? '#DCFCE7' : '#F0FDF4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Send size={18} color={progressStats.status === 'COMPLETED' ? '#15803D' : '#128C7E'} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                    {progressStats.status === 'COMPLETED' ? 'Broadcast Dispatched!' : 'Broadcasting in Progress...'}
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    Campaign #{activeCampaign} • Live SSE Stream
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowProgressModal(false)}
                style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Counters */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
              <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A' }}>{progressStats.total}</div>
                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Total Targets</div>
              </div>
              <div style={{ background: '#DCFCE7', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803D' }}>{progressStats.sent}</div>
                <div style={{ fontSize: '0.72rem', color: '#15803D' }}>Dispatched</div>
              </div>
              <div style={{ background: '#FEE2E2', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#DC2626' }}>{progressStats.failed}</div>
                <div style={{ fontSize: '0.72rem', color: '#DC2626' }}>Failed</div>
              </div>
            </div>

            {/* Progress Bar */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{
                width: '100%',
                height: '8px',
                borderRadius: '999px',
                background: '#F1F5F9',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${progressStats.total > 0 ? (progressStats.sent / progressStats.total) * 100 : 0}%`,
                  height: '100%',
                  background: 'var(--brand-wa)',
                  borderRadius: '999px',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>

            {/* Live Throttle & Pacing Adjuster */}
            <div style={{
              background: '#F8FAFC',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              padding: '12px 14px',
              marginBottom: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Zap size={15} color="var(--brand-wa)" />
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A' }}>
                    Active Dispatch Throttle:
                  </span>
                  <span style={{ fontSize: '0.825rem', fontWeight: 800, color: 'var(--brand-wa)' }}>
                    {liveDelay} ms
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                    (~{(1000 / (liveDelay || 1)).toFixed(1)} msgs/sec)
                  </span>
                  {updatingThrottle && (
                    <span style={{ fontSize: '0.675rem', color: '#D97706', fontWeight: 600 }}>Syncing...</span>
                  )}
                </div>

                {/* Quick Presets during run */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[100, 250, 500, 1000].map(ms => (
                    <button
                      key={ms}
                      type="button"
                      disabled={progressStats.status === 'COMPLETED' || progressStats.status === 'CANCELLED'}
                      onClick={() => handleLiveThrottleChange(ms)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        border: liveDelay === ms ? '1px solid var(--brand-wa)' : '1px solid #CBD5E1',
                        background: liveDelay === ms ? '#F0FDF4' : '#FFFFFF',
                        color: liveDelay === ms ? '#15803D' : '#475569',
                        cursor: 'pointer'
                      }}
                    >
                      {ms}ms
                    </button>
                  ))}
                </div>
              </div>

              {/* Slider for on-the-fly adjustment */}
              <input
                type="range"
                min="50"
                max="3000"
                step="25"
                disabled={progressStats.status === 'COMPLETED' || progressStats.status === 'CANCELLED'}
                value={Math.min(3000, Math.max(50, liveDelay))}
                onChange={e => handleLiveThrottleChange(e.target.value)}
                style={{
                  width: '100%',
                  height: '5px',
                  accentColor: 'var(--brand-wa)',
                  cursor: 'pointer'
                }}
              />
            </div>

            {/* Real-time Log Box */}
            <div style={{
              background: '#0F172A',
              color: '#F8FAFC',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              padding: '14px',
              borderRadius: '8px',
              height: '180px',
              overflowY: 'auto',
              marginBottom: '20px'
            }}>
              {streamLogs.map((log, idx) => (
                <div key={idx} style={{ marginBottom: '4px', opacity: 0.9 }}>
                  <span style={{ color: '#64748B', marginRight: '8px' }}>[{log.time}]</span>
                  <span>{log.text}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                {progressStats.status !== 'COMPLETED' && progressStats.status !== 'CANCELLED' && (
                  <>
                    <button
                      type="button"
                      onClick={handleTogglePauseCampaign}
                      className="btn btn-secondary"
                      style={{ padding: '7px 12px', fontSize: '0.78rem', gap: '6px' }}
                    >
                      {campaignPaused ? <Play size={13} color="#16A34A" /> : <Pause size={13} color="#D97706" />}
                      <span>{campaignPaused ? 'Resume Broadcast' : 'Pause Broadcast'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCancelCampaign}
                      className="btn btn-danger"
                      style={{ padding: '7px 12px', fontSize: '0.78rem', gap: '6px' }}
                    >
                      <StopCircle size={13} />
                      <span>Stop Broadcast</span>
                    </button>
                  </>
                )}
              </div>

              <button
                onClick={() => setShowProgressModal(false)}
                className="btn btn-secondary"
                style={{ padding: '8px 16px' }}
              >
                Close Monitor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add WhatsApp Number Modal */}
      <AddPhoneNumberModal
        isOpen={showAddPhoneModal}
        onClose={() => setShowAddPhoneModal(false)}
        onPhoneAdded={handlePhoneAdded}
      />
    </div>
  );
}
