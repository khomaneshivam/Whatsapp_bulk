import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Cpu, 
  Sheet, 
  Play, 
  CheckCircle2, 
  Save, 
  RefreshCw,
  Tag,
  UploadCloud,
  FileSpreadsheet,
  AlertCircle,
  Radio,
  Trash2,
  Clock,
  Sparkles
} from 'lucide-react';
import { formatIndianDate, formatIndianTime } from '../utils/indianTime';

export default function AutomationPage() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Auto-Sync and Evergreen Campaign State
  const [autoSync, setAutoSync] = useState(true);
  const [autoSyncIntervalHours, setAutoSyncIntervalHours] = useState(3);
  const [lastSyncTime, setLastSyncTime] = useState(new Date());
  const [hasSavedUploads, setHasSavedUploads] = useState(false);
  const [clearingUploads, setClearingUploads] = useState(false);

  // Automation settings state
  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetTabName, setSheetTabName] = useState('Sheet1');
  const [stages, setStages] = useState({
    beforeCheckIn: {
      enabled: true,
      time: '11:00',
      daysOffset: 1,
      templateName: 'kt_best_route_to_property',
      variableMappings: {}
    },
    onCheckIn: {
      enabled: true,
      time: '09:00',
      templateName: 'kt_invitation_',
      variableMappings: {}
    },
    onCheckOut: {
      enabled: true,
      time: '10:00',
      templateName: 'kt_checkout_belongings_reminder',
      variableMappings: {}
    },
    afterCheckOut: {
      enabled: true,
      time: '14:00',
      daysOffset: 1,
      templateName: 'kt_restaurant_invitation',
      variableMappings: {}
    }
  });

  // Sheet inspector data
  const [sheetData, setSheetData] = useState([]);
  const [sheetHeaders, setSheetHeaders] = useState([]);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  function extractTemplateVariables(tmpl) {
    if (!tmpl) return [];
    if (Array.isArray(tmpl.variables) && tmpl.variables.length > 0) {
      return tmpl.variables.map((v, idx) => ({
        key: String(v.key || v.name || idx + 1),
        label: v.label || `{{${v.key || v.name || idx + 1}}}`,
        name: v.name || v.key || `Variable ${idx + 1}`,
        example: v.example || ''
      }));
    }
    const text = tmpl.bodyText || tmpl.body_text || tmpl.components?.find(c => c.type === 'BODY')?.text || '';
    const matches = text.match(/\{\{([a-zA-Z0-9_-]+)\}\}/g) || [];
    return matches.map((m, idx) => {
      const k = m.replace(/[{}]/g, '');
      return {
        key: k,
        label: m,
        name: `Variable {{${k}}}`,
        example: ''
      };
    });
  }

  function normalizeClientStages(rawStages, fallback = {}) {
    if (!rawStages || typeof rawStages !== 'object') return fallback;
    const getStage = (camelKey, lowerKey) => {
      const s = rawStages[camelKey] || rawStages[lowerKey] || fallback[camelKey] || {};
      return {
        enabled: s.enabled !== false,
        time: s.time || s.dispatchTime || (camelKey === 'beforeCheckIn' ? '11:00' : camelKey === 'onCheckIn' ? '09:00' : camelKey === 'onCheckOut' ? '10:00' : '14:00'),
        daysOffset: s.daysOffset !== undefined ? Number(s.daysOffset) : (s.offsetDays !== undefined ? Number(s.offsetDays) : (camelKey === 'beforeCheckIn' || camelKey === 'afterCheckOut' ? 1 : 0)),
        templateName: s.templateName || '',
        variableMappings: s.variableMappings || {}
      };
    };

    return {
      beforeCheckIn: getStage('beforeCheckIn', 'beforeCheckin'),
      onCheckIn: getStage('onCheckIn', 'onCheckin'),
      onCheckOut: getStage('onCheckOut', 'onCheckout'),
      afterCheckOut: getStage('afterCheckOut', 'afterCheckout')
    };
  }

  function sanitizeMappingsForHeaders(currentStages, validHeaders = []) {
    if (!validHeaders || validHeaders.length === 0) return currentStages;
    const updated = { ...currentStages };
    
    // Find smart candidate columns from headers
    const nameCol = validHeaders.find(h => /^(name|guest|customer|client)$/i.test(h)) || validHeaders.find(h => /name|guest/i.test(h));
    const resortCol = validHeaders.find(h => /^(resort|property|hotel|villa)$/i.test(h)) || validHeaders.find(h => /resort|property|hotel|villa/i.test(h));
    const linkCol = validHeaders.find(h => /link|url|map|website/i.test(h));

    for (const [stKey, stObj] of Object.entries(updated)) {
      if (!stObj || typeof stObj !== 'object') continue;
      const currentMap = stObj.variableMappings || {};
      const cleanedMap = { ...currentMap }; // Preserve all existing user selections!

      // Auto-populate unmapped variables with smart matching columns only if empty
      if (nameCol && !cleanedMap['1'] && !cleanedMap['name']) {
        cleanedMap['1'] = nameCol;
      }
      if (resortCol && !cleanedMap['2'] && !cleanedMap['restaurant'] && !cleanedMap['resort']) {
        cleanedMap['2'] = resortCol;
      }
      if (linkCol && !cleanedMap['3'] && !cleanedMap['link']) {
        cleanedMap['3'] = linkCol;
      }

      updated[stKey] = {
        ...stObj,
        variableMappings: cleanedMap
      };
    }
    return updated;
  }

  function handleStageTemplateChange(stageKey, tmplName) {
    const tmpl = templates.find(t => t.name === tmplName);
    const vars = extractTemplateVariables(tmpl);
    const existing = stages[stageKey]?.variableMappings || {};
    const newMappings = {};

    vars.forEach(v => {
      // 1. Maintain existing mapping if present
      if (existing[v.key]) {
        newMappings[v.key] = existing[v.key];
      } else if (v.key === '1' && existing['name']) {
        newMappings[v.key] = existing['name'];
      } else if (v.key === 'name' && existing['1']) {
        newMappings[v.key] = existing['1'];
      } else if (v.key === '2' && (existing['resort'] || existing['restaurant'] || existing['property'])) {
        newMappings[v.key] = existing['resort'] || existing['restaurant'] || existing['property'];
      } else if (v.key === 'restaurant' && (existing['2'] || existing['resort'])) {
        newMappings[v.key] = existing['2'] || existing['resort'];
      } else if (v.key === '3' && existing['link']) {
        newMappings[v.key] = existing['link'];
      } else if (v.key === 'link' && existing['3']) {
        newMappings[v.key] = existing['3'];
      } else if (sheetHeaders.length > 0) {
        // 2. Auto-detect from sheet headers if available
        const found = sheetHeaders.find(h => 
          h.toLowerCase() === v.key.toLowerCase() ||
          ((v.key === '1' || v.key === 'name') && /name|guest/i.test(h)) ||
          ((v.key === '2' || v.key === 'resort' || v.key === 'restaurant') && /property|villa|resort|hotel/i.test(h)) ||
          ((v.key === '3' || v.key === 'link') && /link|url|map/i.test(h))
        );
        if (found) newMappings[v.key] = found;
      }
    });

    setStages(prev => ({
      ...prev,
      [stageKey]: {
        ...prev[stageKey],
        templateName: tmplName,
        variableMappings: newMappings
      }
    }));
  }

  function handleVariableMappingChange(stageKey, varKey, value) {
    setStages(prev => ({
      ...prev,
      [stageKey]: {
        ...prev[stageKey],
        variableMappings: {
          ...(prev[stageKey]?.variableMappings || {}),
          [varKey]: value
        }
      }
    }));
  }

  const [loadingTemplates, setLoadingTemplates] = useState(false);

  async function handleRefreshTemplatesOnly() {
    setLoadingTemplates(true);
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const tmplRes = await fetch('/api/broadcast/templates', { headers });
      const tmplData = await tmplRes.json();
      const list = tmplData.templates || tmplData.data || [];
      if (list.length > 0) {
        setTemplates(list);
        setSuccessMsg(`✓ Synced ${list.length} approved WhatsApp templates from Meta.`);
        setTimeout(() => setSuccessMsg(null), 3500);
      }
    } catch (err) {
      setErrorMsg('Failed to refresh templates: ' + err.message);
    } finally {
      setLoadingTemplates(false);
    }
  }

  useEffect(() => {
    loadAutomationConfig();
  }, []);

  // Periodic Auto-Sync Timer (runs every 3 hours or user configured interval)
  useEffect(() => {
    if (!autoSync) return;
    const intervalMs = (Number(autoSyncIntervalHours) || 3) * 60 * 60 * 1000;
    const timer = setInterval(() => {
      fetchSheetPreview(null, null, false, true);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [autoSync, autoSyncIntervalHours, sheetUrl, sheetTabName]);

  async function loadAutomationConfig() {
    setLoading(true);
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      
      // Load templates
      const tmplRes = await fetch('/api/broadcast/templates', { headers });
      const tmplData = await tmplRes.json();
      const list = tmplData.templates || tmplData.data || [];
      if (list.length > 0) {
        setTemplates(list);
      }

      // Check for saved contacts
      try {
        const cRes = await fetch('/api/automation/contacts?limit=1', { headers });
        const cData = await cRes.json();
        if (cData.count > 0) {
          setHasSavedUploads(true);
        }
      } catch (e) {}

      // Load automation settings
      const cfgRes = await fetch('/api/automation/config', { headers });
      const cfgData = await cfgRes.json();
      const cfg = cfgData.config || cfgData.data;
      if (cfgData.success && cfg) {
        if (cfg.sheetUrl) setSheetUrl(cfg.sheetUrl);
        if (cfg.sheetTabName) setSheetTabName(cfg.sheetTabName);
        if (cfg.stages) setStages(normalizeClientStages(cfg.stages));
        if (cfg.autoSyncIntervalHours) setAutoSyncIntervalHours(Number(cfg.autoSyncIntervalHours) || 3);
      }

      // Load sheet or saved contacts preview
      fetchSheetPreview(cfg?.sheetUrl, cfg?.sheetTabName, false);
    } catch (err) {
      console.error('Failed to load automation config:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSheetPreview(urlOverride = null, tabOverride = null, isManual = false, isForce = false) {
    const targetUrl = urlOverride !== null ? urlOverride : sheetUrl;
    setSheetLoading(true);
    if (isManual) setErrorMsg(null);
    try {
      const targetTab = tabOverride !== null ? tabOverride : sheetTabName;
      const res = await fetch('/api/automation/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          sheetUrl: targetUrl || '',
          sheetTabName: targetTab,
          forceSync: isForce || isManual
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const hdrs = data.headers && data.headers.length > 0 ? data.headers : [];
        if (hdrs.length > 0) {
          setSheetHeaders(hdrs);
          setStages(prev => sanitizeMappingsForHeaders(prev, hdrs));
        }
        if (data.rows) {
          setSheetData(data.rows);
        }
        setLastSyncTime(new Date());
        if (isManual) {
          setSuccessMsg(`✓ Synced: ${hdrs.length} columns, ${data.rows?.length || 0} active records.`);
          setTimeout(() => setSuccessMsg(null), 4000);
        }
      } else {
        if (isManual) {
          const msg = data.message || 'Failed to sync Google Sheet. Please check URL and permissions.';
          setErrorMsg(msg);
        }
      }
    } catch (err) {
      if (isManual) {
        console.warn('Could not load sheet preview:', err);
        const msg = 'Error syncing sheet: ' + err.message;
        setErrorMsg(msg);
      }
    } finally {
      setSheetLoading(false);
    }
  }

  async function handleAutomationFileUpload(e) {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setUploadingFile(true);
    setErrorMsg(null);
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
      const cols = d.columns || [];
      const rows = d.allRows || d.preview || [];

      // Permanently persist uploaded contacts in database
      const saveRes = await fetch('/api/automation/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ contacts: rows })
      });
      const saveData = await saveRes.json();
      setHasSavedUploads(true);

      const formattedRows = rows.map((r, idx) => ({
        rowIndex: idx + 1,
        rawData: r.data || r,
        ...r
      }));

      setSheetHeaders(cols);
      setSheetData(formattedRows);
      setStages(prev => sanitizeMappingsForHeaders(prev, cols));
      setLastSyncTime(new Date());

      setSuccessMsg(`✓ Saved ${saveData.savedCount || formattedRows.length} contacts permanently to database from ${uploadedFile.name}. Continuous automation is active.`);
      setTimeout(() => setSuccessMsg(null), 6000);
    } catch (err) {
      console.error('File upload error in automation:', err);
      setErrorMsg('Failed to upload file: ' + err.message);
    } finally {
      setUploadingFile(false);
    }
  }

  async function handleClearSavedContacts() {
    if (!confirm('Clear all permanently saved uploaded contacts from database?')) return;
    setClearingUploads(true);
    try {
      const res = await fetch('/api/automation/contacts', {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.success) {
        setHasSavedUploads(false);
        setSuccessMsg('✓ Cleared saved uploaded contacts from database.');
        setTimeout(() => setSuccessMsg(null), 4000);
        fetchSheetPreview(null, null, false);
      }
    } catch (err) {
      setErrorMsg('Failed to clear contacts: ' + err.message);
    } finally {
      setClearingUploads(false);
    }
  }

  async function handleSaveConfig(e) {
    if (e && e.preventDefault) e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/automation/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ sheetUrl, sheetTabName, stages, autoSyncIntervalHours })
      });
      const data = await res.json();
      if (data.success) {
        if (data.config?.stages) {
          setStages(normalizeClientStages(data.config.stages));
        }
        setSuccessMsg('✓ Automation templates, schedules, and mappings permanently saved to database!');
        setTimeout(() => setSuccessMsg(null), 5000);
        fetchSheetPreview(sheetUrl, sheetTabName, false, true);
      } else {
        alert(data.message || 'Failed to save automation configuration.');
      }
    } catch (err) {
      alert('Save error: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRunEvaluationNow() {
    if (!confirm('Evaluate all active Google Sheet / Excel bookings and dispatch eligible WhatsApp messages right now?')) return;
    setEvaluating(true);
    try {
      const res = await fetch('/api/automation/evaluate', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        const count = data.dispatchedCount !== undefined ? data.dispatchedCount : (data.summary?.totalSent || 0);
        alert(data.message || `Automation Evaluation Complete! Dispatched: ${count} messages.`);
        fetchSheetPreview(null, null, true, true);
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setEvaluating(false);
    }
  }

  const stageDefs = [
    {
      key: 'beforeCheckIn',
      title: 'Stage 1: Before Check-In Day',
      subtitle: 'Advance villa directions, check-in instructions, and packing checklist.',
      color: '#2563EB',
      hasOffset: true,
      defaultOffset: 1,
      offsetLabel: 'Days Before Check-in'
    },
    {
      key: 'onCheckIn',
      title: 'Stage 2: On Check-In Day',
      subtitle: 'Warm welcome greeting, caretaker contact number, and key handover confirmation.',
      color: '#15803D',
      hasOffset: false
    },
    {
      key: 'onCheckOut',
      title: 'Stage 3: On Check-Out Day',
      subtitle: 'Luggage assistance, settlement invoice details, and departure assistance.',
      color: '#D97706',
      hasOffset: false
    },
    {
      key: 'afterCheckOut',
      title: 'Stage 4: After Check-Out (Post Stay)',
      subtitle: 'Google review link, hospitality feedback inquiry, and repeat guest discount code.',
      color: '#9333EA',
      hasOffset: true,
      defaultOffset: 1,
      offsetLabel: 'Days After Check-out'
    }
  ];

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '28px 24px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
            Booking Lifecycle Automation
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
            Continuous hands-free WhatsApp messaging synchronized with live Google Sheets, Excel (.xlsx/.xls), or CSV booking dates.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={saving}
            className="btn btn-primary"
            style={{ gap: '6px', height: '38px', padding: '0 16px', fontSize: '0.85rem' }}
          >
            <Save size={16} />
            <span>{saving ? 'Saving...' : 'Save Automation Config'}</span>
          </button>
          <button
            onClick={handleRunEvaluationNow}
            disabled={evaluating}
            className="btn btn-action-green"
            style={{ height: '38px', padding: '0 16px', fontSize: '0.85rem' }}
          >
            <Play size={16} />
            <span>{evaluating ? 'Evaluating Live Bookings...' : 'Evaluate & Run Triggers Now'}</span>
          </button>
        </div>
      </div>

      {/* Evergreen Campaign & Auto-Sync Status Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
        borderRadius: '12px',
        padding: '16px 20px',
        color: '#FFFFFF',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px',
        boxShadow: '0 4px 14px rgba(15, 23, 42, 0.12)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'rgba(37, 211, 102, 0.15)',
            border: '1px solid rgba(37, 211, 102, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Radio size={20} color="#25D366" className={autoSync ? 'pulse-glow' : ''} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.96rem', fontWeight: 700 }}>
                Always-On Saved Campaign: Running in Background
              </span>
              <span style={{
                background: '#22C55E',
                color: '#FFFFFF',
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '12px',
                letterSpacing: '0.04em'
              }}>
                ACTIVE
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span>🔄 Auto-Sync: <strong>{autoSync ? `Every ${autoSyncIntervalHours} hour${autoSyncIntervalHours > 1 ? 's' : ''}` : 'Paused'}</strong></span>
              <span>•</span>
              <span>⏱️ Last Synced: <strong>{lastSyncTime ? formatIndianTime(lastSyncTime, true) : 'Just now'}</strong></span>
              <span>•</span>
              <span>📊 Active Records: <strong>{sheetData.length}</strong></span>
              {hasSavedUploads && (
                <>
                  <span>•</span>
                  <span style={{ color: '#FCD34D' }}>💾 Includes Uploaded List</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontSize: '0.74rem', color: '#CBD5E1' }}>Interval:</span>
            <select
              value={autoSyncIntervalHours}
              onChange={e => {
                const val = Number(e.target.value) || 3;
                setAutoSyncIntervalHours(val);
                fetch('/api/automation/config', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                  },
                  body: JSON.stringify({ autoSyncIntervalHours: val })
                });
              }}
              style={{
                height: '32px',
                fontSize: '0.75rem',
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#FFFFFF',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                cursor: 'pointer'
              }}
            >
              <option value={1} style={{ color: '#0F172A' }}>Every 1 hour</option>
              <option value={3} style={{ color: '#0F172A' }}>Every 3 hours</option>
              <option value={6} style={{ color: '#0F172A' }}>Every 6 hours</option>
              <option value={12} style={{ color: '#0F172A' }}>Every 12 hours</option>
              <option value={24} style={{ color: '#0F172A' }}>Every 24 hours</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => setAutoSync(!autoSync)}
            className="btn btn-secondary"
            style={{
              height: '32px',
              fontSize: '0.75rem',
              padding: '0 10px',
              background: autoSync ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.08)',
              color: autoSync ? '#4ADE80' : '#E2E8F0',
              border: autoSync ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(255, 255, 255, 0.15)'
            }}
          >
            <span>{autoSync ? 'Auto-Sync: ON' : 'Auto-Sync: OFF'}</span>
          </button>

          <button
            type="button"
            onClick={() => fetchSheetPreview(null, null, true, true)}
            disabled={sheetLoading}
            className="btn btn-secondary"
            style={{
              height: '32px',
              fontSize: '0.75rem',
              padding: '0 12px',
              background: 'rgba(255, 255, 255, 0.12)',
              color: '#FFFFFF',
              border: '1px solid rgba(255, 255, 255, 0.25)'
            }}
            title="Fetch fresh data from Google Sheet right now"
          >
            <RefreshCw size={13} className={sheetLoading ? 'pulse-glow' : ''} />
            <span>{sheetLoading ? 'Syncing...' : 'Sync Now'}</span>
          </button>
        </div>
      </div>

      {successMsg && (
        <div style={{
          background: '#DCFCE7',
          border: '1px solid #BBF7D0',
          borderRadius: '8px',
          padding: '12px 18px',
          color: '#15803D',
          fontSize: '0.875rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '20px'
        }}>
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div style={{
          background: '#FEE2E2',
          border: '1px solid #FCA5A5',
          borderRadius: '8px',
          padding: '12px 18px',
          color: '#DC2626',
          fontSize: '0.875rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '20px'
        }}>
          <AlertCircle size={18} />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSaveConfig}>
        {/* Spreadsheet Data Source Integration Card */}
        <div className="saas-card" style={{ padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <Sheet size={18} color="var(--brand-wa)" /> Booking Data Source (Google Sheet / Excel / CSV)
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {hasSavedUploads && (
                <button
                  type="button"
                  onClick={handleClearSavedContacts}
                  disabled={clearingUploads}
                  className="btn btn-secondary"
                  style={{ height: '36px', fontSize: '0.78rem', color: '#DC2626', borderColor: '#FCA5A5', display: 'flex', alignItems: 'center', gap: '6px' }}
                  title="Clear uploaded contacts saved in database"
                >
                  <Trash2 size={14} />
                  <span>{clearingUploads ? 'Clearing...' : 'Clear Uploaded List'}</span>
                </button>
              )}
              <label className="btn btn-secondary" style={{ height: '36px', fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <UploadCloud size={15} color="var(--brand-wa)" />
                <span>{uploadingFile ? 'Parsing & Saving File...' : 'Upload Excel / CSV'}</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleAutomationFileUpload}
                  disabled={uploadingFile}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(180px, 1fr) auto', gap: '14px', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '5px' }}>
                Google Sheet Live URL (Public or Shared with Link)
              </label>
              <input
                type="url"
                placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                className="saas-input"
                value={sheetUrl}
                onChange={e => setSheetUrl(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '5px' }}>
                Tab / Worksheet Name
              </label>
              <input
                type="text"
                placeholder="Sheet1"
                className="saas-input"
                value={sheetTabName}
                onChange={e => setSheetTabName(e.target.value)}
              />
            </div>

            <button
              type="button"
              onClick={() => fetchSheetPreview(null, null, true)}
              disabled={sheetLoading || !sheetUrl}
              className="btn btn-secondary"
              style={{ height: '42px' }}
            >
              <RefreshCw size={15} className={sheetLoading ? 'pulse-glow' : ''} />
              <span>{sheetLoading ? 'Syncing...' : 'Sync Sheet'}</span>
            </button>
          </div>

          {sheetHeaders.length > 0 && (
            <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0F172A' }}>
                Loaded Columns ({sheetHeaders.length}):
              </span>
              {sheetHeaders.map(col => (
                <span key={col} className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                  {col}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 4-Stage Lifecycle Cards Grid */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A' }}>
              Configure 4-Stage Booking Messages & Schedule
            </div>
            <button
              type="button"
              onClick={handleRefreshTemplatesOnly}
              disabled={loadingTemplates}
              className="btn btn-secondary"
              style={{ fontSize: '0.78rem', height: '32px', padding: '0 12px', gap: '6px' }}
            >
              <RefreshCw size={13} className={loadingTemplates ? 'pulse-glow' : ''} />
              <span>{loadingTemplates ? 'Refreshing Templates...' : `Refresh Templates (${templates.length} Available)`}</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '18px' }}>
            {stageDefs.map(st => {
              const cfg = stages[st.key] || {};
              const chosenTmpl = templates.find(t => t.name === cfg.templateName);
              const tmplVars = extractTemplateVariables(chosenTmpl);
              const previewText = chosenTmpl?.bodyText || chosenTmpl?.body_text || chosenTmpl?.components?.find(c => c.type === 'BODY')?.text || '';

              return (
                <div 
                  key={st.key}
                  className="saas-card"
                  style={{
                    padding: '20px',
                    borderTop: `4px solid ${st.color}`,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0F172A' }}>{st.title}</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={cfg.enabled !== false}
                          onChange={e => setStages(prev => ({
                            ...prev,
                            [st.key]: { ...prev[st.key], enabled: e.target.checked }
                          }))}
                          style={{ width: '16px', height: '16px', accentColor: 'var(--brand-wa)' }}
                        />
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: cfg.enabled !== false ? '#15803D' : '#94A3B8' }}>
                          {cfg.enabled !== false ? 'ACTIVE' : 'PAUSED'}
                        </span>
                      </label>
                    </div>

                    <p style={{ fontSize: '0.78rem', color: '#64748B', lineHeight: 1.45, marginBottom: '16px' }}>
                      {st.subtitle}
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {/* Template Selector */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>
                            WhatsApp Template
                          </label>
                          {chosenTmpl && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--brand-wa)', fontWeight: 600 }}>
                              {chosenTmpl.category || 'MARKETING'} • {chosenTmpl.language || 'en'}
                            </span>
                          )}
                        </div>
                        <select
                          className="saas-input"
                          value={cfg.templateName || ''}
                          onChange={e => handleStageTemplateChange(st.key, e.target.value)}
                        >
                          <option value="">-- Select Approved Template --</option>
                          {['UTILITY', 'MARKETING', 'AUTHENTICATION'].map(cat => {
                            const catTemplates = templates.filter(t => (t.category || 'MARKETING').toUpperCase() === cat);
                            if (catTemplates.length === 0) return null;
                            const catLabel = cat === 'UTILITY' ? '⚡ Utility Templates' : cat === 'AUTHENTICATION' ? '🔐 Authentication Templates' : '📢 Marketing Templates';
                            return (
                              <optgroup key={cat} label={catLabel}>
                                {catTemplates.map(tmpl => (
                                  <option key={tmpl.name} value={tmpl.name}>
                                    {tmpl.name} ({tmpl.language || 'en'})
                                  </option>
                                ))}
                              </optgroup>
                            );
                          })}
                        </select>
                        {previewText && (
                          <div style={{
                            marginTop: '6px',
                            padding: '8px 10px',
                            background: '#F8FAFC',
                            borderRadius: '6px',
                            border: '1px solid #E2E8F0',
                            fontSize: '0.73rem',
                            color: '#475569',
                            lineHeight: 1.4,
                            maxHeight: '62px',
                            overflowY: 'auto',
                            whiteSpace: 'pre-line'
                          }}>
                            {previewText}
                          </div>
                        )}

                        {/* Variables Selection: ONLY FROM SHEET/EXCEL/CSV COLUMNS */}
                        {tmplVars.length > 0 && (
                          <div style={{
                            background: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            borderRadius: '8px',
                            padding: '12px',
                            marginTop: '10px'
                          }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: '8px'
                            }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <Tag size={13} color="var(--brand-wa)" /> Variables Mapping ({tmplVars.length})
                              </span>
                              <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                Select column from sheet/file
                              </span>
                            </div>

                            {sheetHeaders.length === 0 ? (
                              <div style={{
                                background: '#FFFBEB',
                                border: '1px solid #FDE68A',
                                borderRadius: '6px',
                                padding: '8px 10px',
                                fontSize: '0.72rem',
                                color: '#92400E'
                              }}>
                                ⚠️ No columns loaded yet. Click <strong>"Sync Sheet"</strong> or <strong>"Upload Excel / CSV"</strong> above to populate sheet columns.
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {tmplVars.map(v => {
                                  const curVal = cfg.variableMappings?.[v.key] ?? '';

                                  return (
                                    <div key={v.key} style={{ background: '#FFFFFF', padding: '8px 10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0F172A', fontFamily: 'monospace' }}>
                                          {v.label} {v.name && v.name !== v.key ? `(${v.name})` : ''}
                                        </span>
                                        {v.example && (
                                          <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>
                                            Ex: {v.example}
                                          </span>
                                        )}
                                      </div>

                                      <select
                                        className="saas-input"
                                        style={{ fontSize: '0.75rem', height: '34px', padding: '0 8px', width: '100%' }}
                                        value={curVal}
                                        onChange={e => handleVariableMappingChange(st.key, v.key, e.target.value)}
                                      >
                                        <option value="">-- Select Column from Sheet / Excel / CSV --</option>
                                        {sheetHeaders.map(col => (
                                          <option key={col} value={col}>{col}</option>
                                        ))}
                                      </select>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Daily Trigger Time */}
                      <div style={{ display: 'grid', gridTemplateColumns: st.hasOffset ? '1fr 1fr' : '1fr', gap: '10px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                            Trigger Time (IST)
                          </label>
                          <input
                            type="time"
                            className="saas-input"
                            value={cfg.time || '10:00'}
                            onChange={e => setStages(prev => ({
                              ...prev,
                              [st.key]: { ...prev[st.key], time: e.target.value }
                            }))}
                          />
                        </div>

                        {st.hasOffset && (
                          <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                              {st.offsetLabel}
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="30"
                              className="saas-input"
                              value={cfg.daysOffset || st.defaultOffset}
                              onChange={e => setStages(prev => ({
                                ...prev,
                                [st.key]: { ...prev[st.key], daysOffset: parseInt(e.target.value, 10) || 1 }
                              }))}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{
                    marginTop: '16px',
                    paddingTop: '12px',
                    borderTop: '1px solid #F1F5F9',
                    fontSize: '0.72rem',
                    color: '#94A3B8'
                  }}>
                    Auto-dispatched via node-cron daily worker
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Save Automation Settings Bar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '28px' }}>
          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary"
            style={{ padding: '10px 24px' }}
          >
            <Save size={16} />
            <span>{saving ? 'Saving Configurations...' : 'Save Automation Schedule & Templates'}</span>
          </button>
        </div>
      </form>

      {/* Live Spreadsheet Booking Inspector Table */}
      <div className="saas-card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>
              Live Booking Spreadsheet Inspector & Trigger Timelines
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
              All 4 lifecycle stages evaluated against today's date ({formatIndianDate(new Date())}, Indian Standard Time - IST).
            </p>
          </div>

          <span className="badge badge-neutral">
            {sheetData.length} Records Loaded ({sheetHeaders.length} Columns)
          </span>
        </div>

        {/* Informational Guidance Box */}
        <div style={{
          background: '#F0FDF4',
          border: '1px solid #BBF7D0',
          borderRadius: '8px',
          padding: '10px 14px',
          fontSize: '0.78rem',
          color: '#166534',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>💡</span>
          <span>
            <strong>How Lifecycle Dates Work:</strong> Stage 1 (Pre-Checkin) calculates before check-in date. Stage 2 triggers on check-in day. Stage 3 triggers on check-out day. Stage 4 triggers <strong>after</strong> check-out date (e.g. for check-out on 16 Oct with +1 day offset, feedback sends on <strong>17 Oct at the specified time</strong>).
          </span>
        </div>

        {sheetLoading ? (
          <div style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
            <RefreshCw size={24} className="pulse-glow" style={{ margin: '0 auto 8px auto' }} />
            <div>Fetching live booking spreadsheet records...</div>
          </div>
        ) : sheetData.length === 0 ? (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            background: '#F8FAFC',
            borderRadius: '10px',
            border: '1px dashed var(--border-color)'
          }}>
            <Sheet size={32} color="#94A3B8" style={{ margin: '0 auto 10px auto' }} />
            <div style={{ fontWeight: 600, color: '#334155' }}>No spreadsheet records loaded</div>
            <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '4px' }}>
              Enter a Google Sheet URL above and click "Sync Sheet", or click "Upload Excel / CSV" to choose an Excel or CSV file.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '35px' }}>#</th>
                  <th>Guest / Contact</th>
                  <th>Dates (In / Out)</th>
                  <th style={{ background: 'rgba(37, 99, 235, 0.05)' }}>🚗 1. Pre-Checkin</th>
                  <th style={{ background: 'rgba(21, 128, 61, 0.05)' }}>🏨 2. Check-in Day</th>
                  <th style={{ background: 'rgba(217, 119, 6, 0.05)' }}>🧳 3. Check-out Day</th>
                  <th style={{ background: 'rgba(147, 51, 234, 0.05)' }}>⭐ 4. Post-Checkout</th>
                  <th>Property</th>
                </tr>
              </thead>
              <tbody>
                {sheetData.slice(0, 50).map((row, idx) => {
                  const rowObj = row.rawData || row.data || row;
                  const gName = row.guestName || rowObj['name'] || rowObj['Guest Name'] || 'Guest';
                  const phone = row.cleanPhone || row.rawPhone || rowObj['contact'] || rowObj['Phone'] || '—';
                  const inDate = row.checkinDate || rowObj['check-in'] || rowObj['Checkin Date'] || '—';
                  const outDate = row.checkoutDate || rowObj['check-out'] || rowObj['Checkout Date'] || '—';
                  const property = row.propertyName || rowObj['resort'] || rowObj['Property Name'] || '—';
                  const st = row.stages || {};

                  const renderStageStatus = (stageObj, defaultLabel) => {
                    if (!stageObj) return <span style={{ color: '#94A3B8', fontSize: '0.72rem' }}>—</span>;
                    if (stageObj.status === 'DISABLED') {
                      return <span style={{ color: '#94A3B8', fontSize: '0.72rem' }}>Disabled</span>;
                    }
                    if (stageObj.status === 'ALREADY_SENT') {
                      return (
                        <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '2px' }}>
                          <span className="badge badge-success" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                            ✓ Sent
                          </span>
                          <span style={{ fontSize: '0.66rem', color: '#15803D' }}>{stageObj.targetDate}</span>
                        </div>
                      );
                    }
                    if (stageObj.status === 'DUE_FOR_SEND') {
                      return (
                        <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '2px' }}>
                          <span className="badge badge-warning pulse-glow" style={{ fontSize: '0.68rem', padding: '2px 8px', background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' }}>
                            ⚡ Due Now
                          </span>
                          <span style={{ fontSize: '0.66rem', color: '#B45309' }}>{stageObj.dispatchTime}</span>
                        </div>
                      );
                    }
                    if (stageObj.status === 'SCHEDULED_FOR_TODAY') {
                      return (
                        <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '2px' }}>
                          <span className="badge" style={{ fontSize: '0.68rem', padding: '2px 8px', background: '#DBEAFE', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
                            🕒 Today at {stageObj.dispatchTime}
                          </span>
                          <span style={{ fontSize: '0.66rem', color: '#2563EB' }}>Target: {stageObj.targetDate}</span>
                        </div>
                      );
                    }
                    if (stageObj.status === 'FUTURE_UPCOMING') {
                      return (
                        <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '2px' }}>
                          <span className="badge badge-neutral" style={{ fontSize: '0.68rem', padding: '2px 8px', background: '#F1F5F9', color: '#334155' }}>
                            📅 {stageObj.targetDate}
                          </span>
                          <span style={{ fontSize: '0.66rem', color: '#64748B' }}>Time: {stageObj.dispatchTime}</span>
                        </div>
                      );
                    }
                    if (stageObj.status === 'PAST') {
                      return (
                        <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Past ({stageObj.targetDate})</span>
                        </div>
                      );
                    }
                    return <span style={{ fontSize: '0.72rem', color: '#64748B' }}>{stageObj.status}</span>;
                  };

                  return (
                    <tr key={idx}>
                      <td style={{ color: '#94A3B8', fontSize: '0.78rem' }}>{idx + 1}</td>
                      <td>
                        <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.85rem' }}>{gName}</div>
                        <div style={{ fontSize: '0.74rem', color: '#64748B', fontFamily: 'monospace' }}>+{phone}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.78rem', color: '#0F172A' }}>In: <strong>{inDate}</strong></div>
                        <div style={{ fontSize: '0.78rem', color: '#64748B' }}>Out: <strong>{outDate}</strong></div>
                      </td>
                      <td style={{ background: 'rgba(37, 99, 235, 0.02)' }}>
                        {renderStageStatus(st.beforeCheckin, 'Pre-Checkin')}
                      </td>
                      <td style={{ background: 'rgba(21, 128, 61, 0.02)' }}>
                        {renderStageStatus(st.onCheckin, 'Check-in')}
                      </td>
                      <td style={{ background: 'rgba(217, 119, 6, 0.02)' }}>
                        {renderStageStatus(st.onCheckout, 'Check-out')}
                      </td>
                      <td style={{ background: 'rgba(147, 51, 234, 0.02)' }}>
                        {renderStageStatus(st.afterCheckout, 'Post-Checkout')}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#334155' }}>
                        {property}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
