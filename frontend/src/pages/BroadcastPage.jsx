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
  Image as ImageIcon,
  Megaphone,
  Lock,
  Tag,
  ExternalLink
} from 'lucide-react';
import { formatIndianDateTime, formatIndianTime, formatIndianDate, getIndianCurrentInputString } from '../utils/indianTime';
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

  // Multi-Template Categories & Meta Sync State
  const [categoriesSummary, setCategoriesSummary] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [syncingMeta, setSyncingMeta] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState(null);
  const [showWabaPromptModal, setShowWabaPromptModal] = useState(false);
  const [wabaModalInput, setWabaModalInput] = useState('');
  const [savingWaba, setSavingWaba] = useState(false);

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
  const [isCampaignScheduled, setIsCampaignScheduled] = useState(false);
  const [scheduledQueue, setScheduledQueue] = useState([]);

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

  // Milestone points positioned along the interactive throttle bar
  const DELAY_MILESTONES = [
    { ms: 50, label: '50ms', tag: 'Ultra Fast', speed: '~20/s', pct: 0 },
    { ms: 100, label: '100ms', tag: 'Turbo', speed: '~10/s', pct: 16.67 },
    { ms: 250, label: '250ms', tag: 'Optimal', speed: '~4/s', pct: 33.33 },
    { ms: 500, label: '500ms', tag: 'Safe', speed: '~2/s', pct: 50.0 },
    { ms: 1000, label: '1000ms', tag: 'Standard', speed: '~1/s', pct: 66.67 },
    { ms: 2000, label: '2000ms', tag: 'Relaxed', speed: '~0.5/s', pct: 83.33 },
    { ms: 3000, label: '3000ms', tag: 'Gentle', speed: '~0.3/s', pct: 100 }
  ];

  function delayToPercent(ms) {
    const val = Number(ms) || 50;
    if (val <= DELAY_MILESTONES[0].ms) return 0;
    if (val >= DELAY_MILESTONES[DELAY_MILESTONES.length - 1].ms) return 100;
    for (let i = 0; i < DELAY_MILESTONES.length - 1; i++) {
      const cur = DELAY_MILESTONES[i];
      const next = DELAY_MILESTONES[i + 1];
      if (val >= cur.ms && val <= next.ms) {
        const ratio = (val - cur.ms) / (next.ms - cur.ms);
        return cur.pct + ratio * (next.pct - cur.pct);
      }
    }
    return 50;
  }

  function percentToDelay(pct) {
    const p = Math.max(0, Math.min(100, Number(pct) || 0));
    for (const m of DELAY_MILESTONES) {
      if (Math.abs(p - m.pct) <= 2.2) {
        return m.ms;
      }
    }
    for (let i = 0; i < DELAY_MILESTONES.length - 1; i++) {
      const cur = DELAY_MILESTONES[i];
      const next = DELAY_MILESTONES[i + 1];
      if (p >= cur.pct && p <= next.pct) {
        const ratio = (p - cur.pct) / (next.pct - cur.pct);
        const rawMs = cur.ms + ratio * (next.ms - cur.ms);
        return Math.round(rawMs / 25) * 25;
      }
    }
    return 250;
  }

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

      // Load template categories summary breakdown
      try {
        const catRes = await fetch('/api/broadcast/templates/categories', { headers });
        const catData = await catRes.json();
        if (catData.categories) {
          setCategoriesSummary(catData.categories);
        }
      } catch (catErr) {
        console.warn('Failed to load template categories summary:', catErr.message);
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

      // Load active scheduled campaigns
      await loadScheduledQueue();
    } catch (err) {
      console.error('Failed to load broadcast pre-requisites:', err);
    }
  }

  async function loadScheduledQueue() {
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch('/api/campaigns', { headers });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setScheduledQueue(data.data.filter(c => c.status === 'SCHEDULED'));
      }
    } catch (e) {
      console.warn('Scheduled queue fetch note:', e.message);
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

  async function handleSyncMetaTemplates(wabaOverride = null) {
    setSyncingMeta(true);
    setSyncFeedback(null);
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };
      const bodyPayload = {};
      if (selectedCategory && selectedCategory !== 'ALL') {
        bodyPayload.category = selectedCategory;
      }
      if (wabaOverride && String(wabaOverride).trim()) {
        bodyPayload.wabaId = String(wabaOverride).trim();
      }

      const res = await fetch('/api/broadcast/templates/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyPayload)
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.code === 'MISSING_WABA_ID') {
          setShowWabaPromptModal(true);
          return;
        }
        throw new Error(data.message || 'Failed to sync templates from Meta');
      }

      if (Array.isArray(data.templates) && data.templates.length > 0) {
        setTemplates(data.templates);
        if (!selectedTemplate || !data.templates.some(t => t.name === selectedTemplate.name)) {
          handleSelectTemplate(data.templates[0]);
        }
      }

      // Reload category breakdown
      try {
        const catRes = await fetch('/api/broadcast/templates/categories', { headers });
        const catData = await catRes.json();
        if (catData.categories) setCategoriesSummary(catData.categories);
      } catch (e) {}

      setSyncFeedback({
        type: 'success',
        text: data.message || `✓ Synced ${data.syncedCount || 0} templates successfully from Meta.`
      });
      setTimeout(() => setSyncFeedback(null), 6000);
    } catch (err) {
      setSyncFeedback({
        type: 'error',
        text: `✗ ${err.message}`
      });
    } finally {
      setSyncingMeta(false);
    }
  }

  async function handleSaveWabaAndSync(e) {
    if (e) e.preventDefault();
    const cleanWaba = wabaModalInput.trim();
    if (!cleanWaba) return;

    setSavingWaba(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };
      await fetch('/api/settings', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          WHATSAPP_BUSINESS_ACCOUNT_ID: cleanWaba,
          WHATSAPP_WABA_ID: cleanWaba
        })
      });

      setShowWabaPromptModal(false);
      setWabaModalInput('');
      await handleSyncMetaTemplates(cleanWaba);
    } catch (err) {
      alert('Failed to save WABA ID: ' + err.message);
    } finally {
      setSavingWaba(false);
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
    if (isScheduled && !scheduledTime) {
      alert('Please specify a future date and time for the scheduled dispatch.');
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

      const isSched = Boolean(isScheduled && scheduledTime);
      setActiveCampaign(data.campaignId);
      setIsCampaignScheduled(isSched);

      if (isSched) {
        setProgressStats({
          total: data.totalRecipients || validationStats.valid || fileRows.length || 0,
          sent: 0,
          failed: 0,
          status: 'SCHEDULED'
        });
        setStreamLogs([
          { time: formatIndianTime(new Date(), true), text: `⏰ Campaign '${campaignName || data.campaignId}' scheduled for ${formatIndianDateTime(scheduledTime)} (IST)!` },
          { time: formatIndianTime(new Date(), true), text: `Status: SCHEDULED. Target contacts: ${data.totalRecipients || validationStats.valid || fileRows.length || 0}. The scheduler will auto-launch this at the specified time.` },
          { time: formatIndianTime(new Date(), true), text: `ℹ️ You can trigger "Run Now" below to dispatch immediately or "Cancel Schedule" if you change your mind.` }
        ]);
        loadScheduledQueue();
      } else {
        setProgressStats(prev => ({ ...prev, status: 'IN_PROGRESS', total: data.totalRecipients || prev.total }));
        setStreamLogs(prev => [
          ...prev,
          { time: new Date().toLocaleTimeString(), text: `Campaign #${data.campaignId} created with ${throttleDelay}ms pacing! Initializing real-time SSE telemetry...` }
        ]);

        // Connect to SSE stream for live progress
        connectSSEStream(data.campaignId);
      }
    } catch (err) {
      setProgressStats(prev => ({ ...prev, status: 'FAILED' }));
      setStreamLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), text: `Error: ${err.message}` }]);
    } finally {
      setSending(false);
    }
  }

  async function connectSSEStream(campaignId) {
    try {
      let streamToken = token;
      try {
        const tokenRes = await fetch('/api/broadcast/stream-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          if (tokenData?.streamToken) {
            streamToken = tokenData.streamToken;
          }
        }
      } catch (err) {
        console.warn('Could not fetch dedicated stream token, using fallback', err);
      }

      const eventSource = new EventSource(`/api/broadcast/stream?campaignId=${campaignId}&streamToken=${encodeURIComponent(streamToken)}`);
      
      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const type = (payload.type || payload.TYPE || '').toUpperCase();
          
          if (type === 'PROGRESS') {
            const isSent = (payload.status || '').toUpperCase() === 'SENT';
            const isFailed = (payload.status || '').toUpperCase() === 'FAILED';
            setProgressStats(prev => ({
              ...prev,
              sent: payload.sent !== undefined ? payload.sent : (isSent ? prev.sent + 1 : prev.sent),
              failed: payload.failed !== undefined ? payload.failed : (isFailed ? prev.failed + 1 : prev.failed),
              total: payload.total !== undefined ? payload.total : prev.total,
              status: payload.status || prev.status
            }));
            if (payload.delayMs !== undefined) {
              setLiveDelay(payload.delayMs);
            }
            const recipientLabel = payload.lastRecipient || payload.name || payload.phone;
            if (recipientLabel) {
              setStreamLogs(prev => [
                {
                  time: new Date().toLocaleTimeString(),
                  text: isSent
                    ? `✅ Sent to ${recipientLabel} (${payload.metaMessageId || 'Meta Accepted'})`
                    : `❌ Failed to ${recipientLabel}: ${payload.error || 'Dispatch error'}`
                },
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
              setProgressStats(prev => ({
                ...prev,
                status: payload.status,
                sent: payload.sent !== undefined ? payload.sent : prev.sent,
                failed: payload.failed !== undefined ? payload.failed : prev.failed,
                total: payload.total !== undefined ? payload.total : prev.total
              }));
              setCampaignPaused(payload.status === 'PAUSED');
              setStreamLogs(prev => [
                { time: new Date().toLocaleTimeString(), text: `Status update: ${payload.status} - ${payload.message || ''}` },
                ...prev.slice(0, 50)
              ]);
            }
          } else if (type === 'COMPLETED') {
            setProgressStats(prev => ({
              ...prev,
              status: 'COMPLETED',
              sent: payload.sent !== undefined ? payload.sent : prev.sent,
              failed: payload.failed !== undefined ? payload.failed : prev.failed
            }));
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

  async function handleCancelCampaign(campaignId) {
    const targetId = campaignId || activeCampaign;
    if (!targetId) return;
    if (!confirm('Are you sure you want to stop and cancel this broadcast campaign?')) return;
    try {
      const res = await fetch(`/api/campaigns/${targetId}/cancel`, {
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
        loadScheduledQueue();
        alert('✓ Broadcast campaign has been cancelled.');
      } else {
        alert(data.message || 'Failed to cancel campaign');
      }
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleRunScheduledNow(campaignId) {
    const targetId = campaignId || activeCampaign;
    if (!targetId) return;
    if (!confirm('Do you want to launch this scheduled campaign immediately right now?')) return;
    try {
      const res = await fetch(`/api/campaigns/${targetId}/run-now`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to trigger scheduled campaign');
      }
      setIsCampaignScheduled(false);
      setShowProgressModal(true);
      setActiveCampaign(targetId);
      setProgressStats(prev => ({ ...prev, status: 'IN_PROGRESS' }));
      setStreamLogs(prev => [
        { time: new Date().toLocaleTimeString(), text: '🚀 Operator triggered scheduled broadcast immediately! Initializing live SSE telemetry...' },
        ...prev
      ]);
      connectSSEStream(targetId);
      loadScheduledQueue();
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

      {/* Upcoming Scheduled Broadcasts Queue Banner */}
      {scheduledQueue.length > 0 && (
        <div style={{
          background: '#F5F3FF',
          border: '1px solid #DDD6FE',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '24px',
          boxShadow: 'var(--shadow-xs)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Clock size={20} color="#7C3AED" />
              <span style={{ fontWeight: 800, color: '#5B21B6', fontSize: '0.95rem' }}>
                Upcoming Scheduled Broadcasts ({scheduledQueue.length})
              </span>
            </div>
            <span style={{ fontSize: '0.78rem', color: '#6D28D9' }}>
              These campaigns are queued to send automatically at their scheduled times.
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {scheduledQueue.map(item => (
              <div
                key={item.id}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E9D5FF',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap'
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.9rem' }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', display: 'flex', gap: '12px', marginTop: '2px', flexWrap: 'wrap' }}>
                    <span>Template: <strong>{item.template_name}</strong></span>
                    <span>Targets: <strong>{item.valid_contacts || item.total_contacts}</strong></span>
                    <span style={{ color: '#7C3AED', fontWeight: 600 }}>
                      ⏰ Scheduled for: <strong>{formatIndianDateTime(item.scheduled_at)} (IST)</strong>
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => handleRunScheduledNow(item.id)}
                    className="btn btn-secondary"
                    style={{
                      padding: '5px 12px',
                      fontSize: '0.75rem',
                      background: '#DCFCE7',
                      color: '#15803D',
                      borderColor: '#86EFAC',
                      fontWeight: 700,
                      gap: '4px'
                    }}
                    title="Launch this campaign immediately right now"
                  >
                    <Play size={12} />
                    <span>Run Now</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCancelCampaign(item.id)}
                    className="btn btn-danger"
                    style={{ padding: '5px 12px', fontSize: '0.75rem', gap: '4px' }}
                    title="Cancel this scheduled broadcast"
                  >
                    <StopCircle size={12} />
                    <span>Cancel Schedule</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                    <Layers size={19} color="var(--brand-wa)" /> Select Official Meta Template
                  </h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '4px 0 0 0' }}>
                    Choose pre-approved WhatsApp templates categorized by Marketing, Utility, and Authentication.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleSyncMetaTemplates()}
                    disabled={syncingMeta}
                    className="btn btn-action-green"
                    style={{ padding: '6px 14px', fontSize: '0.78rem', gap: '6px' }}
                    title="Fetch and synchronize approved templates directly from Meta WhatsApp Cloud API"
                  >
                    <RefreshCw size={13} className={syncingMeta ? 'pulse-glow spin' : ''} />
                    <span>{syncingMeta ? 'Syncing from Meta...' : 'Sync from Meta'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={loadData}
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.78rem', gap: '4px' }}
                    title="Reload templates from database"
                  >
                    <RefreshCw size={13} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* Multi-Template Category Tabs Bar */}
              {(() => {
                const totalCount = templates.length;
                const mktCount = templates.filter(t => (t.category || 'MARKETING').toUpperCase() === 'MARKETING').length;
                const utlCount = templates.filter(t => (t.category || '').toUpperCase() === 'UTILITY').length;
                const authCount = templates.filter(t => (t.category || '').toUpperCase() === 'AUTHENTICATION').length;

                const tabs = [
                  { key: 'ALL', label: 'All Templates', count: totalCount, icon: Layers, activeColor: '#0F172A', activeBg: '#F1F5F9', activeBorder: '#CBD5E1' },
                  { key: 'MARKETING', label: 'Marketing', count: mktCount, icon: Megaphone, activeColor: '#7C3AED', activeBg: '#F3E8FF', activeBorder: '#E9D5FF' },
                  { key: 'UTILITY', label: 'Utility', count: utlCount, icon: Zap, activeColor: '#16A34A', activeBg: '#DCFCE7', activeBorder: '#BBF7D0' },
                  { key: 'AUTHENTICATION', label: 'Authentication', count: authCount, icon: Lock, activeColor: '#D97706', activeBg: '#FEF3C7', activeBorder: '#FDE68A' }
                ];

                return (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '16px',
                    overflowX: 'auto',
                    paddingBottom: '4px'
                  }}>
                    {tabs.map(tab => {
                      const isSel = selectedCategory === tab.key;
                      const IconComp = tab.icon;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setSelectedCategory(tab.key)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '7px',
                            padding: '8px 14px',
                            borderRadius: '8px',
                            border: isSel ? `1.5px solid ${tab.activeColor}` : '1px solid var(--border-color)',
                            background: isSel ? tab.activeBg : '#FFFFFF',
                            color: isSel ? tab.activeColor : '#64748B',
                            fontWeight: isSel ? 700 : 600,
                            fontSize: '0.825rem',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.15s ease',
                            boxShadow: isSel ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
                          }}
                        >
                          <IconComp size={15} color={isSel ? tab.activeColor : '#94A3B8'} />
                          <span>{tab.label}</span>
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '1px 7px',
                            borderRadius: '999px',
                            background: isSel ? '#FFFFFF' : '#F1F5F9',
                            color: isSel ? tab.activeColor : '#64748B',
                            border: `1px solid ${isSel ? tab.activeBorder : '#E2E8F0'}`
                          }}>
                            {tab.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Template Search & Live Meta Inspector */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '12px', color: '#94A3B8' }} />
                  <input
                    type="text"
                    placeholder={`Filter ${selectedCategory === 'ALL' ? 'all' : selectedCategory.toLowerCase()} templates by name or text...`}
                    className="saas-input"
                    style={{ paddingLeft: '32px', paddingRight: templateSearch ? '28px' : '10px' }}
                    value={templateSearch}
                    onChange={e => setTemplateSearch(e.target.value)}
                  />
                  {templateSearch && (
                    <button
                      type="button"
                      onClick={() => setTemplateSearch('')}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '10px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#94A3B8',
                        padding: '2px'
                      }}
                    >
                      <X size={14} />
                    </button>
                  )}
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

              {/* Sync and Inspect Feedback Banners */}
              {syncFeedback && (
                <div style={{
                  padding: '9px 14px',
                  borderRadius: '8px',
                  marginBottom: '14px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: syncFeedback.type === 'success' ? '#DCFCE7' : '#FEE2E2',
                  color: syncFeedback.type === 'success' ? '#15803D' : '#DC2626',
                  border: `1px solid ${syncFeedback.type === 'success' ? '#BBF7D0' : '#FECACA'}`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {syncFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    <span>{syncFeedback.text}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSyncFeedback(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

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
              {(() => {
                const filtered = templates.filter(tmpl => {
                  // Category Filter
                  if (selectedCategory !== 'ALL') {
                    const cat = (tmpl.category || 'MARKETING').toUpperCase();
                    if (cat !== selectedCategory) return false;
                  }
                  // Search query filter
                  if (templateSearch.trim()) {
                    const q = templateSearch.toLowerCase().trim();
                    const matchName = tmpl.name?.toLowerCase().includes(q);
                    const matchCat = tmpl.category?.toLowerCase().includes(q);
                    const matchId = String(tmpl.meta_id || tmpl.id || '').toLowerCase().includes(q);
                    const matchBody = String(tmpl.bodyText || tmpl.body_text || '').toLowerCase().includes(q);
                    if (!matchName && !matchCat && !matchId && !matchBody) return false;
                  }
                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <div style={{
                      padding: '36px 20px',
                      textAlign: 'center',
                      background: '#F8FAFC',
                      border: '1px dashed #CBD5E1',
                      borderRadius: '10px',
                      marginBottom: '16px'
                    }}>
                      <Layers size={32} color="#94A3B8" style={{ margin: '0 auto 8px auto' }} />
                      <div style={{ fontSize: '0.925rem', fontWeight: 700, color: '#334155' }}>
                        No {selectedCategory === 'ALL' ? '' : selectedCategory.toLowerCase()} templates found
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#64748B', maxWidth: '380px', margin: '4px auto 14px auto' }}>
                        {templateSearch ? `No templates matched "${templateSearch}".` : `There are no approved templates saved in the ${selectedCategory} category yet.`}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleSyncMetaTemplates()}
                          disabled={syncingMeta}
                          className="btn btn-action-green"
                          style={{ fontSize: '0.78rem', padding: '6px 14px' }}
                        >
                          <RefreshCw size={13} className={syncingMeta ? 'pulse-glow spin' : ''} />
                          <span>Sync {selectedCategory === 'ALL' ? 'All' : selectedCategory} from Meta</span>
                        </button>
                        {selectedCategory !== 'ALL' && (
                          <button
                            type="button"
                            onClick={() => { setSelectedCategory('ALL'); setTemplateSearch(''); }}
                            className="btn btn-secondary"
                            style={{ fontSize: '0.78rem', padding: '6px 14px' }}
                          >
                            <span>View All Templates</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '12px',
                    maxHeight: '320px',
                    overflowY: 'auto',
                    padding: '4px',
                    marginBottom: '16px'
                  }}>
                    {filtered.map(tmpl => {
                      const isSelected = selectedTemplate?.name === tmpl.name;
                      const catUpper = (tmpl.category || 'MARKETING').toUpperCase();
                      const varCount = Array.isArray(tmpl.variables) ? tmpl.variables.length : 0;

                      // Category specific colors
                      const catStyle = catUpper === 'UTILITY'
                        ? { bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0', label: '⚡ Utility' }
                        : catUpper === 'AUTHENTICATION'
                          ? { bg: '#FEF3C7', color: '#92400E', border: '#FDE68A', label: '🔐 Auth' }
                          : { bg: '#F3E8FF', color: '#6B21A8', border: '#E9D5FF', label: '📢 Marketing' };

                      return (
                        <div
                          key={tmpl.name}
                          onClick={() => handleSelectTemplate(tmpl)}
                          style={{
                            padding: '14px',
                            borderRadius: '10px',
                            border: isSelected ? '2px solid var(--brand-wa)' : '1px solid var(--border-color)',
                            background: isSelected ? '#F0FDF4' : '#FFFFFF',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            boxShadow: isSelected ? '0 0 0 2px rgba(18, 140, 126, 0.18)' : 'var(--shadow-xs)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between'
                          }}
                        >
                          <div>
                            {/* Card Top: Name & Language */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px', gap: '6px' }}>
                              <span style={{
                                fontWeight: 700,
                                fontSize: '0.875rem',
                                color: isSelected ? '#0d7064' : '#0F172A',
                                wordBreak: 'break-word',
                                lineHeight: 1.3
                              }}>
                                {tmpl.name}
                              </span>
                              <span className="badge badge-neutral" style={{ fontSize: '0.65rem', padding: '1px 6px', flexShrink: 0 }}>
                                {tmpl.language || 'en'}
                              </span>
                            </div>

                            {/* Card Middle Badges: Category, Status, Variables */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                              {/* Category Badge */}
                              <span style={{
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                padding: '2px 7px',
                                borderRadius: '4px',
                                background: catStyle.bg,
                                color: catStyle.color,
                                border: `1px solid ${catStyle.border}`
                              }}>
                                {catStyle.label}
                              </span>

                              {/* Status Badge */}
                              <span style={{
                                fontSize: '0.65rem',
                                fontWeight: 600,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: tmpl.status === 'APPROVED' ? '#DCFCE7' : '#FEF3C7',
                                color: tmpl.status === 'APPROVED' ? '#15803D' : '#B45309'
                              }}>
                                {tmpl.status || 'APPROVED'}
                              </span>

                              {/* Variable Count */}
                              <span style={{
                                fontSize: '0.65rem',
                                color: '#64748B',
                                background: '#F1F5F9',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontWeight: 600
                              }}>
                                {varCount > 0 ? `${varCount} vars` : 'No vars'}
                              </span>
                            </div>

                            {/* Body snippet */}
                            {tmpl.bodyText && (
                              <div style={{
                                fontSize: '0.73rem',
                                color: '#475569',
                                lineHeight: 1.35,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                background: isSelected ? '#FFFFFF' : '#F8FAFC',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                border: '1px solid #E2E8F0'
                              }}>
                                {tmpl.bodyText}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

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

              {/* Header Media URL (Image / Document / Video) */}
              {selectedTemplate?.components?.some(c => c.type === 'HEADER' && c.format !== 'TEXT') && (() => {
                const headerComp = selectedTemplate.components.find(c => c.type === 'HEADER');
                const mediaFormat = (headerComp?.format || 'IMAGE').toUpperCase();
                const templateExampleUrl = headerComp?.example?.header_handle?.[0] || '';

                return (
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <ImageIcon size={15} color="var(--brand-wa)" />
                        <span>Header Media URL ({mediaFormat})</span>
                        <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Meta Required</span>
                      </label>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {templateExampleUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setHeaderMediaUrl(templateExampleUrl);
                              setHeaderMediaId('');
                            }}
                            className="btn btn-secondary"
                            style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                          >
                            Use Template Default
                          </button>
                        )}
                        <label className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '0.72rem', cursor: 'pointer', margin: 0 }}>
                          <span>{uploadingMedia ? 'Uploading...' : '📁 Upload File'}</span>
                          <input
                            type="file"
                            accept="image/*,application/pdf,video/mp4"
                            onChange={handleMediaFileUpload}
                            disabled={uploadingMedia}
                            style={{ display: 'none' }}
                          />
                        </label>
                      </div>
                    </div>

                    <input
                      type="url"
                      className="saas-input"
                      placeholder="https://example.com/banner.jpg or click Upload File"
                      value={headerMediaUrl}
                      onChange={e => {
                        setHeaderMediaUrl(e.target.value);
                        setHeaderMediaId('');
                      }}
                      style={{ fontSize: '0.85rem' }}
                    />

                    {headerMediaUrl && (
                      <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px', background: '#F8FAFC', padding: '6px 10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                        <img
                          src={headerMediaUrl}
                          alt="Header preview"
                          onError={e => { e.target.style.display = 'none'; }}
                          style={{ width: '40px', height: '30px', objectFit: 'cover', borderRadius: '4px' }}
                        />
                        <span style={{ fontSize: '0.75rem', color: '#64748B', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {headerMediaId ? `Meta Media ID: ${headerMediaId}` : headerMediaUrl}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setHeaderMediaUrl('');
                            setHeaderMediaId('');
                          }}
                          style={{ border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer', fontSize: '0.8rem' }}
                        >
                          ✕
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

                {/* Interactive Dispatch Delay Slider with Clickable Milestone Points */}
                <div style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '12px',
                  padding: '16px 18px',
                  marginBottom: '16px'
                }}>
                  {/* Top Row: Label, Safety Tier Badge, Manual Number Input */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <label htmlFor="step3ThrottleSlider" style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>Adjust Dispatch Delay:</span>
                      </label>
                      <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                        Click any point on the bar or drag to fine-tune pacing
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '3px 9px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        background: currentSafetyTier.badgeBg,
                        color: currentSafetyTier.badgeColor,
                        border: `1px solid ${currentSafetyTier.badgeBorder}`
                      }}>
                        {currentSafetyTier.label}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
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
                            fontSize: '0.9rem',
                            fontWeight: 800,
                            color: '#0F172A',
                            textAlign: 'right'
                          }}
                        />
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B' }}>ms</span>
                      </div>
                    </div>
                  </div>

                  {/* Slider Track with Clickable Milestone Points on the Bar */}
                  <div className="throttle-bar-container" style={{ padding: '14px 6px 6px 6px' }}>
                    <div className="throttle-bar-track">
                      {/* Gradient Fill Track */}
                      <div
                        className="throttle-bar-fill"
                        style={{ width: `${Math.min(100, Math.max(0, delayToPercent(throttleDelay)))}%` }}
                      />

                      {/* Interactive Clickable Milestone Points along the bar */}
                      {DELAY_MILESTONES.map(m => {
                        const isCurrent = Math.abs(throttleDelay - m.ms) < 15;
                        const isPassed = throttleDelay >= m.ms;
                        return (
                          <div
                            key={m.ms}
                            className="throttle-milestone-node"
                            onClick={(e) => {
                              e.stopPropagation();
                              setThrottleDelay(m.ms);
                            }}
                            title={`${m.label} (${m.tag}) • ${m.speed}`}
                            style={{ left: `${m.pct}%` }}
                          >
                            <div
                              className={`throttle-milestone-dot ${isPassed ? 'passed' : 'unpassed'} ${isCurrent ? 'active' : ''}`}
                              style={{
                                width: isCurrent ? '16px' : '12px',
                                height: isCurrent ? '16px' : '12px',
                                background: isCurrent ? '#128C7E' : (isPassed ? '#10B981' : '#FFFFFF'),
                                border: isCurrent ? '3px solid #FFFFFF' : (isPassed ? '2px solid #FFFFFF' : '2px solid #94A3B8'),
                                boxShadow: isCurrent 
                                  ? '0 0 0 3px #128C7E, 0 2px 8px rgba(18, 140, 126, 0.45)' 
                                  : (isPassed ? '0 1px 3px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.1)')
                              }}
                            >
                              {isCurrent && (
                                <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#FFFFFF' }} />
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Native Range Slider Overlaid for smooth dragging */}
                      <input
                        id="step3ThrottleSlider"
                        className="throttle-native-slider"
                        type="range"
                        min="0"
                        max="100"
                        step="0.5"
                        value={Math.min(100, Math.max(0, delayToPercent(throttleDelay)))}
                        onChange={e => setThrottleDelay(percentToDelay(parseFloat(e.target.value)))}
                      />
                    </div>

                    {/* Milestone Labels Directly Under Each Point */}
                    <div style={{
                      position: 'relative',
                      height: '38px',
                      marginTop: '16px',
                      userSelect: 'none'
                    }}>
                      {DELAY_MILESTONES.map((m, idx) => {
                        const isCurrent = Math.abs(throttleDelay - m.ms) < 15;
                        let transformAlign = 'translateX(-50%)';
                        if (idx === 0) transformAlign = 'translateX(0)';
                        else if (idx === DELAY_MILESTONES.length - 1) transformAlign = 'translateX(-100%)';

                        return (
                          <button
                            key={m.ms}
                            type="button"
                            className={`throttle-milestone-btn ${isCurrent ? 'active' : ''}`}
                            onClick={() => setThrottleDelay(m.ms)}
                            style={{
                              position: 'absolute',
                              left: `${m.pct}%`,
                              transform: transformAlign
                            }}
                          >
                            <div style={{
                              fontSize: '0.725rem',
                              fontWeight: isCurrent ? 800 : 700,
                              color: isCurrent ? '#15803D' : '#334155'
                            }}>
                              {m.label}
                            </div>
                            <div style={{
                              fontSize: '0.625rem',
                              fontWeight: 600,
                              color: isCurrent ? '#166534' : '#94A3B8'
                            }}>
                              {m.tag}
                            </div>
                          </button>
                        );
                      })}
                    </div>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                        Dispatch Date & Time (Indian Standard Time - IST)
                      </label>
                      <span className="badge" style={{ background: '#EDE9FE', color: '#6D28D9', fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px' }}>
                        🇮🇳 UTC+05:30 (Asia/Kolkata)
                      </span>
                    </div>
                    <input
                      type="datetime-local"
                      className="saas-input"
                      value={scheduledTime}
                      min={getIndianCurrentInputString(2)}
                      onChange={e => setScheduledTime(e.target.value)}
                    />
                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '6px' }}>
                      Campaign will auto-launch when clock reaches this exact Indian Standard Time.
                    </div>
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
                  background: (isCampaignScheduled || progressStats.status === 'SCHEDULED') ? '#F3E8FF' : (progressStats.status === 'COMPLETED' ? '#DCFCE7' : '#F0FDF4'),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {(isCampaignScheduled || progressStats.status === 'SCHEDULED') ? (
                    <Clock size={18} color="#7C3AED" />
                  ) : (
                    <Send size={18} color={progressStats.status === 'COMPLETED' ? '#15803D' : '#128C7E'} />
                  )}
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                    {(isCampaignScheduled || progressStats.status === 'SCHEDULED')
                      ? 'Campaign Scheduled in Queue'
                      : progressStats.status === 'COMPLETED'
                      ? 'Broadcast Dispatched!'
                      : 'Broadcasting in Progress...'}
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    Campaign #{activeCampaign} • {(isCampaignScheduled || progressStats.status === 'SCHEDULED') ? 'Scheduled Dispatch' : 'Live SSE Stream'}
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

            {/* Scheduled Information Card inside modal */}
            {(isCampaignScheduled || progressStats.status === 'SCHEDULED') && progressStats.status !== 'CANCELLED' && progressStats.status !== 'IN_PROGRESS' && (
              <div style={{
                background: '#F5F3FF',
                border: '1px solid #DDD6FE',
                borderRadius: '10px',
                padding: '14px 16px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Clock size={22} color="#7C3AED" />
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#5B21B6' }}>
                      Scheduled for {scheduledTime ? `${formatIndianDateTime(scheduledTime)} (IST)` : 'Future Date/Time'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6D28D9' }}>
                      Waiting in queue. You can run it immediately or cancel this schedule.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => handleRunScheduledNow(activeCampaign)}
                    className="btn btn-primary"
                    style={{ fontSize: '0.78rem', padding: '6px 12px', background: '#16A34A', border: 'none', gap: '6px' }}
                  >
                    <Play size={13} />
                    <span>Run Now</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCancelCampaign(activeCampaign)}
                    className="btn btn-danger"
                    style={{ fontSize: '0.78rem', padding: '6px 12px', gap: '6px' }}
                  >
                    <StopCircle size={13} />
                    <span>Cancel Schedule</span>
                  </button>
                </div>
              </div>
            )}

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

              {/* Slider for on-the-fly adjustment with interactive milestone points */}
              <div className="throttle-bar-container" style={{ padding: '12px 6px 4px 6px' }}>
                <div className="throttle-bar-track" style={{ height: '6px' }}>
                  <div
                    className="throttle-bar-fill"
                    style={{ width: `${Math.min(100, Math.max(0, delayToPercent(liveDelay)))}%` }}
                  />

                  {/* Interactive milestone points on the live bar */}
                  {DELAY_MILESTONES.map(m => {
                    const isCurrent = Math.abs(liveDelay - m.ms) < 15;
                    const isPassed = liveDelay >= m.ms;
                    return (
                      <div
                        key={m.ms}
                        className="throttle-milestone-node"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (progressStats.status !== 'COMPLETED' && progressStats.status !== 'CANCELLED') {
                            handleLiveThrottleChange(m.ms);
                          }
                        }}
                        title={`${m.label} (${m.tag}) • ${m.speed}`}
                        style={{
                          left: `${m.pct}%`,
                          cursor: (progressStats.status === 'COMPLETED' || progressStats.status === 'CANCELLED') ? 'not-allowed' : 'pointer'
                        }}
                      >
                        <div
                          className={`throttle-milestone-dot ${isPassed ? 'passed' : 'unpassed'} ${isCurrent ? 'active' : ''}`}
                          style={{
                            width: isCurrent ? '14px' : '10px',
                            height: isCurrent ? '14px' : '10px',
                            background: isCurrent ? '#128C7E' : (isPassed ? '#10B981' : '#FFFFFF'),
                            border: isCurrent ? '2.5px solid #FFFFFF' : (isPassed ? '1.5px solid #FFFFFF' : '1.5px solid #94A3B8'),
                            boxShadow: isCurrent ? '0 0 0 2.5px #128C7E' : '0 1px 2px rgba(0,0,0,0.1)'
                          }}
                        />
                      </div>
                    );
                  })}

                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="0.5"
                    disabled={progressStats.status === 'COMPLETED' || progressStats.status === 'CANCELLED'}
                    value={Math.min(100, Math.max(0, delayToPercent(liveDelay)))}
                    onChange={e => handleLiveThrottleChange(percentToDelay(parseFloat(e.target.value)))}
                    className="throttle-native-slider"
                    style={{
                      cursor: (progressStats.status === 'COMPLETED' || progressStats.status === 'CANCELLED') ? 'not-allowed' : 'pointer'
                    }}
                  />
                </div>

                {/* Milestone mini labels */}
                <div style={{ position: 'relative', height: '22px', marginTop: '10px' }}>
                  {DELAY_MILESTONES.map((m, idx) => {
                    const isCurrent = Math.abs(liveDelay - m.ms) < 15;
                    let transformAlign = 'translateX(-50%)';
                    if (idx === 0) transformAlign = 'translateX(0)';
                    else if (idx === DELAY_MILESTONES.length - 1) transformAlign = 'translateX(-100%)';

                    return (
                      <button
                        key={m.ms}
                        type="button"
                        disabled={progressStats.status === 'COMPLETED' || progressStats.status === 'CANCELLED'}
                        onClick={() => handleLiveThrottleChange(m.ms)}
                        style={{
                          position: 'absolute',
                          left: `${m.pct}%`,
                          transform: transformAlign,
                          background: isCurrent ? '#F0FDF4' : 'transparent',
                          border: isCurrent ? '1px solid #86EFAC' : '1px solid transparent',
                          borderRadius: '4px',
                          padding: '1px 4px',
                          cursor: (progressStats.status === 'COMPLETED' || progressStats.status === 'CANCELLED') ? 'not-allowed' : 'pointer',
                          fontSize: '0.675rem',
                          fontWeight: isCurrent ? 800 : 600,
                          color: isCurrent ? '#15803D' : '#64748B'
                        }}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
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
                {(isCampaignScheduled || progressStats.status === 'SCHEDULED') && progressStats.status !== 'CANCELLED' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleRunScheduledNow(activeCampaign)}
                      className="btn btn-secondary"
                      style={{
                        padding: '7px 14px',
                        fontSize: '0.78rem',
                        gap: '6px',
                        background: '#DCFCE7',
                        color: '#15803D',
                        border: '1px solid #86EFAC',
                        fontWeight: 700
                      }}
                    >
                      <Play size={13} />
                      <span>Run Now Immediately</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCancelCampaign(activeCampaign)}
                      className="btn btn-danger"
                      style={{ padding: '7px 14px', fontSize: '0.78rem', gap: '6px' }}
                    >
                      <StopCircle size={13} />
                      <span>Cancel Schedule</span>
                    </button>
                  </>
                ) : progressStats.status !== 'COMPLETED' && progressStats.status !== 'CANCELLED' && (
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
                      onClick={() => handleCancelCampaign(activeCampaign)}
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

      {/* WABA ID Prompt Modal for Syncing Templates */}
      {showWabaPromptModal && (
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
            maxWidth: '520px',
            width: '100%',
            padding: '24px',
            boxShadow: 'var(--shadow-xl)',
            border: '1px solid var(--border-color)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: '#F0FDF4',
                  color: 'var(--brand-wa)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <RefreshCw size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Enter WhatsApp Business Account ID
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    Required by Meta to fetch message templates
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowWabaPromptModal(false)}
                style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.45, marginBottom: '16px' }}>
              To sync all approved templates from Meta directly into your workspace, please enter your <strong>WABA ID</strong> (WhatsApp Business Account ID). You can find this in your <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer" style={{ color: 'var(--brand-wa)', fontWeight: 600 }}>Meta App Dashboard</a> under <em>WhatsApp &gt; API Setup</em>.
            </p>

            <form onSubmit={handleSaveWabaAndSync}>
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  WhatsApp Business Account ID (WABA ID) <span style={{ color: 'var(--error)' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 104829375820491"
                  className="saas-input"
                  required
                  value={wabaModalInput}
                  onChange={e => setWabaModalInput(e.target.value)}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowWabaPromptModal(false)}
                  className="btn btn-secondary"
                  disabled={savingWaba}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingWaba || !wabaModalInput.trim()}
                  className="btn btn-action-green"
                  style={{ gap: '6px' }}
                >
                  <RefreshCw size={14} className={savingWaba ? 'pulse-glow spin' : ''} />
                  <span>{savingWaba ? 'Saving & Syncing...' : 'Save & Sync Templates'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
