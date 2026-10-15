/**
 * WhatsApp Bulk Broadcast Pro - Client Application Logic
 */

// State
let uploadedData = null;
let activeCampaignId = null;
let sseSource = null;
let activeMode = "TEMPLATE"; // 'TEMPLATE' or 'TEXT'
let broadcastStartTime = null;
let currentTemplateDetails = null;
let activeDispatchMode = "NOW"; // 'NOW' or 'SCHEDULE'
let activeRescheduleCampaignId = null;
let tplFetchDebounceTimer = null;

// DOM Elements
const metaStatusPill = document.getElementById("metaStatusPill");
const metaStatusDot = document.getElementById("metaStatusDot");
const metaStatusText = document.getElementById("metaStatusText");
const btnOpenSettings = document.getElementById("btnOpenSettings");
const settingsModal = document.getElementById("settingsModal");
const btnCloseSettings = document.getElementById("btnCloseSettings");
const btnTestMetaConnection = document.getElementById("btnTestMetaConnection");
const btnSaveSettings = document.getElementById("btnSaveSettings");
const settingsTestFeedback = document.getElementById("settingsTestFeedback");

// Toast helper
function showToast(message, type = "success") {
  const toast = document.getElementById("appToast");
  const icon = document.getElementById("toastIcon");
  const msg = document.getElementById("toastMsg");

  icon.textContent = type === "success" ? "✓" : "⚠";
  toast.className = `toast ${type} show`;
  msg.textContent = message;

  setTimeout(() => {
    toast.classList.remove("show");
  }, 4000);
}

// Check and verify Meta Cloud API status
async function checkMetaStatus() {
  try {
    metaStatusText.textContent = "Checking Meta...";
    const res = await fetch("/api/settings/test-connection", { method: "POST" });
    const data = await res.json();

    if (data.success) {
      metaStatusDot.className = "pulse-dot";
      const phone = data.data.displayPhoneNumber || "Active";
      const quality = data.data.qualityRating || "GREEN";
      metaStatusText.textContent = `${phone} • ${quality}`;
      metaStatusPill.title = `Connected: ${data.data.verifiedName} (${phone}) - Quality: ${quality}`;
    } else {
      metaStatusDot.className = "pulse-dot error";
      metaStatusText.textContent = "Meta Disconnected";
      metaStatusPill.title = data.message || "Could not connect to Meta";
    }
  } catch (err) {
    metaStatusDot.className = "pulse-dot error";
    metaStatusText.textContent = "Offline / Error";
  }
}

// Tab navigation
document.querySelectorAll(".nav-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(p => p.style.display = "none");

    tab.classList.add("active");
    const targetId = tab.getAttribute("data-tab");
    const targetPane = document.getElementById(targetId);
    if (targetPane) {
      targetPane.style.display = "block";
    }

    if (targetId === "tab-campaigns") {
      loadCampaignsList();
    } else if (targetId === "tab-replies") {
      loadCustomerReplies();
      loadAutoReplySettings();
    } else if (targetId === "tab-automation") {
      loadAutomationDashboard();
    }
  });
});

// Dropzone file handling
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const btnBrowseFiles = document.getElementById("btnBrowseFiles");

btnBrowseFiles.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("click", (e) => {
  if (e.target !== btnBrowseFiles) fileInput.click();
});

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  if (e.dataTransfer.files.length > 0) {
    uploadFile(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener("change", () => {
  if (fileInput.files.length > 0) {
    uploadFile(fileInput.files[0]);
  }
});

// Upload and Parse File
async function uploadFile(file) {
  const formData = new FormData();
  formData.append("file", file);

  showToast(`Parsing ${file.name}...`, "success");

  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData
    });

    const result = await res.json();
    if (!result.success) {
      throw new Error(result.message);
    }

    uploadedData = result.data;
    renderUploadedData();
    showToast(`Loaded ${uploadedData.totalRows} contacts successfully!`, "success");
  } catch (err) {
    console.error("Upload error:", err);
    showToast(err.message, "error");
  }
}

// Render data from uploaded Excel/CSV
function renderUploadedData() {
  if (!uploadedData) return;

  document.getElementById("fileInspectionArea").style.display = "block";
  document.getElementById("previewFilename").textContent = uploadedData.filename;

  // Stats
  document.getElementById("statTotalRows").textContent = uploadedData.totalRows;
  document.getElementById("statValidRows").textContent = uploadedData.validRows;
  document.getElementById("statInvalidRows").textContent = uploadedData.invalidRows;
  document.getElementById("statDuplicateRows").textContent = uploadedData.duplicateRows;

  // Set default campaign name
  const rawBase = uploadedData.filename.replace(/\.[^/.]+$/, "");
  document.getElementById("inputCampaignName").value = `${rawBase} Broadcast - ${new Date().toLocaleDateString()}`;

  // Column Selectors
  const phoneSelect = document.getElementById("selectPhoneCol");
  const nameSelect = document.getElementById("selectNameCol");

  phoneSelect.innerHTML = "";
  nameSelect.innerHTML = "<option value=''>-- No Name Column --</option>";

  uploadedData.columns.forEach(col => {
    const optP = document.createElement("option");
    optP.value = col;
    optP.textContent = col;
    if (col === uploadedData.detectedPhoneCol) optP.selected = true;
    phoneSelect.appendChild(optP);

    const optN = document.createElement("option");
    optN.value = col;
    optN.textContent = col;
    if (col === uploadedData.detectedNameCol) optN.selected = true;
    nameSelect.appendChild(optN);
  });

  // Re-render preview table
  renderPreviewTable();

  // Populate dynamic variable chips for Custom Text mode
  const chipsContainer = document.getElementById("variableChipsContainer");
  chipsContainer.innerHTML = "";
  uploadedData.columns.forEach(col => {
    const chip = document.createElement("span");
    chip.className = "var-chip";
    chip.textContent = `{{${col}}}`;
    chip.title = `Click to insert {{${col}}}`;
    chip.addEventListener("click", () => insertVariableTag(`{{${col}}}`));
    chipsContainer.appendChild(chip);
  });

  // Populate initial template parameters (default 2 params mapped to Name and first custom col)
  setupDefaultTemplateParams();

  // Update phone preview
  updatePhoneMockup();
}

function renderPreviewTable() {
  const tbody = document.getElementById("previewTableBody");
  tbody.innerHTML = "";

  const phoneCol = document.getElementById("selectPhoneCol").value;
  const nameCol = document.getElementById("selectNameCol").value;

  uploadedData.preview.forEach((row, i) => {
    const rawP = phoneCol ? row.data[phoneCol] : row.rawPhone;
    const nameVal = nameCol ? row.data[nameCol] : (row.contactName || "—");
    const cleanP = row.cleanPhone;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td style="font-weight: 600;">${nameVal || "—"}</td>
      <td><code>${rawP || "—"}</code></td>
      <td><code>${cleanP || "—"}</code></td>
      <td>
        <span class="badge ${row.isValid ? 'badge-valid' : 'badge-invalid'}">
          ${row.isValid ? '✓ Valid' : '✗ ' + row.validationNote}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById("selectPhoneCol").addEventListener("change", renderPreviewTable);
document.getElementById("selectNameCol").addEventListener("change", () => {
  renderPreviewTable();
  updatePhoneMockup();
});

// Dynamic Template Details & Variable Auto-Mapping
async function fetchTemplateDetails(templateIdOrName, autoMap = true) {
  if (!templateIdOrName) return null;
  const clean = String(templateIdOrName).trim();
  if (!clean) return null;

  const badge = document.getElementById("tplFetchStatusBadge");
  if (badge) {
    badge.style.display = "inline";
    badge.textContent = "Checking Meta...";
    badge.style.color = "var(--text-muted)";
  }

  try {
    const res = await fetch(`/api/templates/${encodeURIComponent(clean)}`);
    const data = await res.json();
    if (!data.success || !data.data) {
      throw new Error(data.message || "Template not found");
    }

    currentTemplateDetails = data.data;

    if (badge) {
      badge.textContent = `✓ ${currentTemplateDetails.status || "APPROVED"} (${currentTemplateDetails.language || "en"})`;
      badge.style.color = "var(--accent-wa)";
    }

    // Update language select if language is returned
    const langSelect = document.getElementById("inputTemplateLang");
    if (langSelect && currentTemplateDetails.language) {
      for (let i = 0; i < langSelect.options.length; i++) {
        if (langSelect.options[i].value === currentTemplateDetails.language) {
          langSelect.selectedIndex = i;
          break;
        }
      }
    }

    // Update template info badge
    const badgeTplInfo = document.getElementById("templateInfoBadge");
    if (badgeTplInfo) {
      badgeTplInfo.style.display = "flex";
      const varCount = currentTemplateDetails.variables?.length || 0;
      const varSummary = currentTemplateDetails.variables && currentTemplateDetails.variables.length > 0
        ? currentTemplateDetails.variables.map(v => v.label).join(", ")
        : "0 parameters required";
      badgeTplInfo.innerHTML = `
        <span style="font-size: 1rem;">✓</span>
        <div>
          <strong>${currentTemplateDetails.name}</strong> (ID: <code>${currentTemplateDetails.id}</code>) • <strong>${currentTemplateDetails.category || "APPROVED"}</strong><br>
          <span style="color: var(--text-muted); font-size: 0.72rem;">${varCount} Variable${varCount === 1 ? '' : 's'}: ${varSummary} • Format: ${currentTemplateDetails.parameter_format || 'POSITIONAL'}</span>
        </div>
      `;
    }

    // Show Template Structure Preview Card
    const card = document.getElementById("templateBodyPreviewCard");
    const previewText = document.getElementById("templateBodyPreviewText");
    const countBadge = document.getElementById("templateParamCountBadge");

    if (card && previewText) {
      card.style.display = "block";
      const bodyText = currentTemplateDetails.bodyText || "";
      const varCount = currentTemplateDetails.variables?.length || 0;
      if (countBadge) {
        countBadge.textContent = `${varCount} Variable${varCount === 1 ? '' : 's'} (${currentTemplateDetails.parameter_format || 'Positional'})`;
      }

      // Highlight placeholders {{1}}, {{name}}, etc.
      const highlighted = bodyText.replace(/\{\{([^{}]+)\}\}/g, '<span class="tpl-variable-highlight">{{$1}}</span>');
      previewText.innerHTML = highlighted;
    }

    // Auto-map variables to Excel columns
    if (autoMap) {
      setupTemplateParamRowsFromDetails(currentTemplateDetails);
    }

    updatePhoneMockup();
    return currentTemplateDetails;
  } catch (err) {
    console.warn("Template fetch note:", err.message);
    if (badge) {
      badge.textContent = "Custom Template";
      badge.style.color = "var(--text-muted)";
    }
    return null;
  }
}

// Find best matching Excel column for a template variable
function findBestMatchingColumn(variable, columns, index) {
  if (!columns || columns.length === 0) return "";

  const key = String(variable.key || variable.name || variable.label || "").toLowerCase();
  const cleanKey = key.replace(/[{}]/g, "").trim().toLowerCase();

  // 1. Direct name match
  const direct = columns.find(c => {
    const colClean = c.toLowerCase().trim();
    return colClean === cleanKey || colClean.includes(cleanKey) || cleanKey.includes(colClean);
  });
  if (direct) return direct;

  // 2. Semantic keywords for common variable types
  if (cleanKey === "1" || cleanKey.includes("name")) {
    const found = columns.find(c => /(name|customer|guest|client|person|lead)/i.test(c));
    if (found) return found;
  }
  if (cleanKey === "2" || cleanKey.includes("rest") || cleanKey.includes("hotel") || cleanKey.includes("business")) {
    const found = columns.find(c => /(restaurant|hotel|resort|business|company|shop|organization)/i.test(c));
    if (found) return found;
  }
  if (cleanKey === "3" || cleanKey.includes("link") || cleanKey.includes("url") || cleanKey.includes("web")) {
    const found = columns.find(c => /(link|url|website|site|web|page)/i.test(c));
    if (found) return found;
  }
  if (cleanKey.includes("city") || cleanKey.includes("location") || cleanKey.includes("place")) {
    const found = columns.find(c => /(city|location|town|place|address|dest)/i.test(c));
    if (found) return found;
  }
  if (cleanKey.includes("code") || cleanKey.includes("otp") || cleanKey.includes("offer")) {
    const found = columns.find(c => /(code|otp|offer|coupon|voucher|pass)/i.test(c));
    if (found) return found;
  }

  // 3. Positional order match (excluding phone column)
  const phoneCol = document.getElementById("selectPhoneCol")?.value || "";
  const nonPhoneCols = columns.filter(c => c !== phoneCol);
  if (nonPhoneCols[index]) {
    return nonPhoneCols[index];
  }

  return columns[0] || "";
}

// Populates parameter rows from template details
function setupTemplateParamRowsFromDetails(details) {
  const container = document.getElementById("templateParamsList");
  if (!container) return;
  container.innerHTML = "";

  const hint = document.getElementById("templateParamHint");
  const btnAddParam = document.getElementById("btnAddParam");

  const variables = details?.variables || [];

  if (variables.length === 0) {
    if (hint) {
      hint.innerHTML = `Template <strong>${details?.name || 'Selected'}</strong> has 0 dynamic variables and is ready for broadcast.`;
    }
    if (btnAddParam) btnAddParam.style.display = "none";
    return;
  }

  if (hint) {
    hint.innerHTML = `Template <strong>${details.name}</strong> has <strong>${variables.length}</strong> dynamic variable${variables.length === 1 ? '' : 's'}. Match each variable to an Excel column below:`;
  }
  if (btnAddParam) btnAddParam.style.display = "inline-flex";

  const cols = uploadedData && uploadedData.columns ? uploadedData.columns : [];

  variables.forEach((v, idx) => {
    const matchedCol = findBestMatchingColumn(v, cols, idx);
    addTemplateParamRow(v.label || `{{${idx + 1}}}`, matchedCol, v.key, v.example);
  });
}

function addTemplateParamRow(label, selectedCol = "", varKey = "", exampleVal = "") {
  const container = document.getElementById("templateParamsList");
  const count = container.children.length + 1;
  const paramLabel = label || `{{${count}}}`;
  const key = varKey || String(count);

  const row = document.createElement("div");
  row.className = "template-param-row";
  row.style.cssText = "display: flex; align-items: center; gap: 0.65rem; background: rgba(255,255,255,0.02); padding: 0.45rem 0.65rem; border-radius: var(--radius-sm); border: 1px solid var(--border-glass);";

  const span = document.createElement("span");
  span.style.cssText = "font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; color: var(--accent-wa); min-width: 60px; font-weight: 600;";
  span.textContent = paramLabel;

  const select = document.createElement("select");
  select.className = "form-select param-col-select";
  select.style.flex = "1";
  select.dataset.varKey = key;

  if (uploadedData && uploadedData.columns) {
    uploadedData.columns.forEach(col => {
      const opt = document.createElement("option");
      opt.value = col;
      opt.textContent = `Excel Column: ${col}`;
      if (col === selectedCol) opt.selected = true;
      select.appendChild(opt);
    });
  } else {
    const opt = document.createElement("option");
    opt.value = selectedCol || key;
    opt.textContent = selectedCol || `Column: ${key}`;
    select.appendChild(opt);
  }

  // Live sample preview pill from row 1 of Excel
  const samplePill = document.createElement("span");
  samplePill.className = "param-sample-pill";
  const updateSamplePill = () => {
    const colName = select.value;
    const firstRowData = uploadedData?.preview?.[0]?.data;
    const val = firstRowData && colName && firstRowData[colName] !== undefined
      ? String(firstRowData[colName])
      : (exampleVal || "Sample Value");
    samplePill.textContent = `e.g. "${val}"`;
    samplePill.title = `Preview for first contact: ${val}`;
  };
  updateSamplePill();

  select.addEventListener("change", () => {
    updateSamplePill();
    updatePhoneMockup();
  });

  const removeBtn = document.createElement("button");
  removeBtn.className = "btn btn-secondary btn-sm";
  removeBtn.textContent = "✕";
  removeBtn.type = "button";
  removeBtn.title = "Remove parameter";
  removeBtn.addEventListener("click", () => {
    row.remove();
    updatePhoneMockup();
  });

  row.appendChild(span);
  row.appendChild(select);
  row.appendChild(samplePill);
  row.appendChild(removeBtn);
  container.appendChild(row);

  updatePhoneMockup();
}

function setupDefaultTemplateParams() {
  const currentTpl = (document.getElementById("inputTemplateName")?.value || "kt_invitation_").trim();
  fetchTemplateDetails(currentTpl, true);
}

document.getElementById("btnAddParam").addEventListener("click", () => {
  const container = document.getElementById("templateParamsList");
  const nextNum = container.children.length + 1;
  addTemplateParamRow(`{{${nextNum}}}`);
});

// Mode Toggle (Template vs Text)
const btnModeTemplate = document.getElementById("btnModeTemplate");
const btnModeText = document.getElementById("btnModeText");
const templateModeFields = document.getElementById("templateModeFields");
const textModeFields = document.getElementById("textModeFields");

btnModeTemplate.addEventListener("click", () => {
  activeMode = "TEMPLATE";
  btnModeTemplate.classList.add("active");
  btnModeText.classList.remove("active");
  templateModeFields.style.display = "block";
  textModeFields.style.display = "none";
  updatePhoneMockup();
});

btnModeText.addEventListener("click", () => {
  activeMode = "TEXT";
  btnModeText.classList.add("active");
  btnModeTemplate.classList.remove("active");
  textModeFields.style.display = "block";
  templateModeFields.style.display = "none";
  updatePhoneMockup();
});

// Insert variable tag into custom text textarea
function insertVariableTag(tag) {
  const textarea = document.getElementById("inputTextBody");
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const val = textarea.value;

  textarea.value = val.substring(0, start) + tag + val.substring(end);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = start + tag.length;
  updatePhoneMockup();
}

// Saved System Templates State & Management
let savedSystemTemplates = [];
let verifiedTemplateData = null;
let currentAutomationConfig = {
  preCheckinTemplate: "kt_best_route_to_property",
  checkoutTemplate: "kt_checkout_belongings_reminder",
  stages: {
    beforeCheckin: { enabled: true, offsetDays: 1, dispatchTime: "10:00", templateName: "kt_best_route_to_property" },
    onCheckin: { enabled: false, offsetDays: 0, dispatchTime: "12:00", templateName: "kt_invitation_" },
    onCheckout: { enabled: true, offsetDays: 0, dispatchTime: "09:00", templateName: "kt_checkout_belongings_reminder" },
    afterCheckout: { enabled: false, offsetDays: 1, dispatchTime: "18:00", templateName: "kt_restaurant_invitation" }
  }
};

async function loadSystemTemplates(selectedIdOrName = null) {
  try {
    const res = await fetch("/api/templates");
    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      savedSystemTemplates = data.data;
      renderSystemTemplatePills(selectedIdOrName);
      renderBroadcastTemplateDropdown(selectedIdOrName);
      renderAutomationTemplateDropdowns();
    }
  } catch (err) {
    console.warn("Failed to load saved system templates:", err.message);
  }
}

function renderBroadcastTemplateDropdown(selectedIdOrName = null) {
  const selectElem = document.getElementById("selectSavedBroadcastTemplate");
  if (!selectElem) return;

  const currentTplVal = (selectedIdOrName || document.getElementById("inputTemplateName")?.value || "kt_invitation_").trim().toLowerCase();

  selectElem.innerHTML = `<option value="">-- Choose from Stored Templates in Database (${savedSystemTemplates.length} Available) --</option>`;

  savedSystemTemplates.forEach(tpl => {
    const isSelected = (tpl.name && tpl.name.toLowerCase() === currentTplVal) ||
                       (tpl.id && String(tpl.id).toLowerCase() === currentTplVal) ||
                       (tpl.meta_id && String(tpl.meta_id).toLowerCase() === currentTplVal);

    const opt = document.createElement("option");
    opt.value = tpl.name;
    const varCount = tpl.variables?.length || 0;
    const catLabel = tpl.category || "APPROVED";
    opt.textContent = `${tpl.name} (Meta ID: ${tpl.meta_id || tpl.id}) • ${catLabel} [${varCount} Vars]`;
    if (isSelected) opt.selected = true;
    selectElem.appendChild(opt);
  });
}

function renderAutomationTemplateDropdowns() {
  const stageDefs = [
    {
      selectId: "autoStageBeforeCheckinTemplate",
      hintId: "autoStageBeforeCheckinHint",
      defaultVal: currentAutomationConfig.stages?.beforeCheckin?.templateName || currentAutomationConfig.preCheckinTemplate || "kt_best_route_to_property",
      fallbackLabel: "🚗 Route & Directions"
    },
    {
      selectId: "autoStageOnCheckinTemplate",
      hintId: "autoStageOnCheckinHint",
      defaultVal: currentAutomationConfig.stages?.onCheckin?.templateName || "kt_invitation_",
      fallbackLabel: "🏨 Welcome & Wi-Fi"
    },
    {
      selectId: "autoStageOnCheckoutTemplate",
      hintId: "autoStageOnCheckoutHint",
      defaultVal: currentAutomationConfig.stages?.onCheckout?.templateName || currentAutomationConfig.checkoutTemplate || "kt_checkout_belongings_reminder",
      fallbackLabel: "🧳 Luggage Reminder"
    },
    {
      selectId: "autoStageAfterCheckoutTemplate",
      hintId: "autoStageAfterCheckoutHint",
      defaultVal: currentAutomationConfig.stages?.afterCheckout?.templateName || "kt_restaurant_invitation",
      fallbackLabel: "⭐ Feedback & Review"
    },
    // Backward compatibility for legacy elements if present
    {
      selectId: "autoPreCheckinTemplate",
      hintId: "autoPreCheckinTemplateHint",
      defaultVal: currentAutomationConfig.preCheckinTemplate || "kt_best_route_to_property",
      fallbackLabel: "🚗 Pre-Checkin"
    },
    {
      selectId: "autoCheckoutTemplate",
      hintId: "autoCheckoutTemplateHint",
      defaultVal: currentAutomationConfig.checkoutTemplate || "kt_checkout_belongings_reminder",
      fallbackLabel: "🧳 Checkout"
    }
  ];

  stageDefs.forEach(({ selectId, defaultVal }) => {
    const sel = document.getElementById(selectId);
    if (!sel) return;

    const activeVal = (sel.value || defaultVal || "").toLowerCase().trim();
    sel.innerHTML = "";

    if (savedSystemTemplates.length === 0) {
      sel.innerHTML = `<option value="">No templates in database</option>`;
      return;
    }

    savedSystemTemplates.forEach(tpl => {
      const opt = document.createElement("option");
      opt.value = tpl.name;
      const varCount = tpl.variables?.length || 0;
      opt.textContent = `${tpl.name} [${varCount} Vars]`;
      if (tpl.name.toLowerCase() === activeVal || (tpl.meta_id && String(tpl.meta_id).toLowerCase() === activeVal)) {
        opt.selected = true;
      }
      sel.appendChild(opt);
    });
  });

  updateAutomationTemplateHints();
}

function updateAutomationTemplateHints() {
  const hintPairs = [
    { selectId: "autoStageBeforeCheckinTemplate", hintId: "autoStageBeforeCheckinHint" },
    { selectId: "autoStageOnCheckinTemplate", hintId: "autoStageOnCheckinHint" },
    { selectId: "autoStageOnCheckoutTemplate", hintId: "autoStageOnCheckoutHint" },
    { selectId: "autoStageAfterCheckoutTemplate", hintId: "autoStageAfterCheckoutHint" },
    { selectId: "autoPreCheckinTemplate", hintId: "autoPreCheckinTemplateHint" },
    { selectId: "autoCheckoutTemplate", hintId: "autoCheckoutTemplateHint" }
  ];

  hintPairs.forEach(({ selectId, hintId }) => {
    const sel = document.getElementById(selectId);
    const hint = document.getElementById(hintId);
    if (!sel || !hint) return;

    const tplName = (sel.value || "").toLowerCase().trim();
    const tpl = savedSystemTemplates.find(t => t.name.toLowerCase() === tplName);

    if (tpl && tpl.variables && tpl.variables.length > 0) {
      hint.innerHTML = `Vars: ${tpl.variables.map(v => `<code>${v.label}</code> (${v.example || v.name || v.key})`).join(", ")}`;
    } else {
      hint.innerHTML = `Auto-passes: <code>{{1}}</code> Guest Name, <code>{{2}}</code> Property Name`;
    }
  });
}

function renderSystemTemplatePills(selectedIdOrName = null) {
  const container = document.getElementById("savedTemplatesListContainer");
  if (!container) return;
  container.innerHTML = "";

  if (savedSystemTemplates.length === 0) {
    container.innerHTML = `<span style="font-size: 0.76rem; color: var(--text-muted); font-style: italic;">No templates saved yet. Click "+ Add Template" above to add one.</span>`;
    return;
  }

  const currentTplVal = (selectedIdOrName || document.getElementById("inputTemplateName")?.value || "kt_invitation_").trim().toLowerCase();

  savedSystemTemplates.forEach(tpl => {
    const isSelected = (tpl.name && tpl.name.toLowerCase() === currentTplVal) ||
                       (tpl.id && String(tpl.id).toLowerCase() === currentTplVal) ||
                       (tpl.meta_id && String(tpl.meta_id).toLowerCase() === currentTplVal);

    const pillWrapper = document.createElement("div");
    pillWrapper.style.cssText = "display: inline-flex; align-items: center; position: relative;";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `btn btn-sm template-pill ${isSelected ? 'active' : ''}`;
    btn.style.cssText = `
      border-radius: 20px;
      font-size: 0.78rem;
      padding: 0.35rem 0.85rem;
      border: 1px solid ${isSelected ? 'var(--accent-wa)' : 'rgba(255,255,255,0.15)'};
      color: ${isSelected ? '#fff' : 'var(--text-muted)'};
      background: ${isSelected ? 'rgba(37, 211, 102, 0.25)' : 'transparent'};
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-weight: ${isSelected ? '600' : '400'};
      transition: all 0.2s ease;
    `;

    const icon = tpl.category === 'AUTHENTICATION' ? '🔐' : (tpl.name.includes('restaurant') ? '🍽️' : '★');
    const label = tpl.meta_id && tpl.meta_id !== tpl.name ? `${tpl.name} (${tpl.meta_id})` : tpl.name;
    btn.innerHTML = `<span>${icon}</span> <span>${label}</span>`;

    btn.addEventListener("click", () => {
      selectSystemTemplate(tpl);
    });

    pillWrapper.appendChild(btn);

    // Add delete button for custom added templates
    const isBuiltIn = tpl.name === "kt_invitation_" || tpl.name === "kt_restaurant_invitation" || tpl.name === "konkantrip_auth";
    if (!isBuiltIn) {
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.title = `Remove '${tpl.name}' from system`;
      delBtn.style.cssText = "background: none; border: none; color: #f87171; cursor: pointer; padding: 0 4px; font-size: 0.75rem; margin-left: -6px; margin-right: 4px; opacity: 0.7;";
      delBtn.innerHTML = "&times;";
      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (confirm(`Remove template '${tpl.name}' from saved templates?`)) {
          await deleteSystemTemplate(tpl.id || tpl.meta_id || tpl.name);
        }
      });
      pillWrapper.appendChild(delBtn);
    }

    container.appendChild(pillWrapper);

    if (isSelected) {
      selectSystemTemplate(tpl, false);
    }
  });
}

function selectSystemTemplate(tpl, updateInput = true) {
  currentTemplateDetails = tpl;

  if (updateInput) {
    const inputTplName = document.getElementById("inputTemplateName");
    if (inputTplName) inputTplName.value = tpl.meta_id || tpl.name;
  }

  // Update language select if matched
  const langSelect = document.getElementById("inputTemplateLang");
  if (langSelect && tpl.language) {
    for (let i = 0; i < langSelect.options.length; i++) {
      if (langSelect.options[i].value === tpl.language) {
        langSelect.selectedIndex = i;
        break;
      }
    }
  }

  // Update Template Info Badge
  const badgeTplInfo = document.getElementById("templateInfoBadge");
  if (badgeTplInfo) {
    badgeTplInfo.style.display = "flex";
    const varCount = tpl.variables?.length || 0;
    const varSummary = tpl.variables && tpl.variables.length > 0
      ? tpl.variables.map(v => v.label).join(", ")
      : "0 parameters required";

    badgeTplInfo.innerHTML = `
      <span style="font-size: 1rem;">✓</span>
      <div>
        <strong>${tpl.name}</strong> (ID: <code>${tpl.meta_id || tpl.id}</code>) • <strong>${tpl.category || "APPROVED"}</strong><br>
        <span style="color: var(--text-muted); font-size: 0.72rem;">${varCount} Variable${varCount === 1 ? '' : 's'}: ${varSummary} • Format: ${tpl.parameter_format || 'POSITIONAL'}</span>
      </div>
    `;
  }

  // Update Template Preview Card
  const card = document.getElementById("templateBodyPreviewCard");
  const previewText = document.getElementById("templateBodyPreviewText");
  const countBadge = document.getElementById("templateParamCountBadge");

  if (card && previewText) {
    card.style.display = "block";
    const bodyText = tpl.bodyText || "";
    const varCount = tpl.variables?.length || 0;
    if (countBadge) {
      countBadge.textContent = `${varCount} Variable${varCount === 1 ? '' : 's'} (${tpl.parameter_format || 'Positional'})`;
    }
    const highlighted = bodyText.replace(/\{\{([^{}]+)\}\}/g, '<span class="tpl-variable-highlight">{{$1}}</span>');
    previewText.innerHTML = highlighted;
  }

  // Auto-map parameters to Excel columns
  setupTemplateParamRowsFromDetails(tpl);

  // Update phone mockup
  updatePhoneMockup();

  // Update broadcast select dropdown if matched
  const broadcastSelect = document.getElementById("selectSavedBroadcastTemplate");
  if (broadcastSelect) {
    for (let i = 0; i < broadcastSelect.options.length; i++) {
      if (broadcastSelect.options[i].value.toLowerCase() === tpl.name.toLowerCase()) {
        broadcastSelect.selectedIndex = i;
        break;
      }
    }
  }

  // Re-highlight active pill
  document.querySelectorAll("#savedTemplatesListContainer .template-pill").forEach(p => {
    p.classList.remove("active");
    p.style.borderColor = "rgba(255,255,255,0.15)";
    p.style.color = "var(--text-muted)";
    p.style.background = "transparent";
    p.style.fontWeight = "400";
    if (p.textContent.includes(tpl.name)) {
      p.classList.add("active");
      p.style.borderColor = "var(--accent-wa)";
      p.style.color = "#fff";
      p.style.background = "rgba(37, 211, 102, 0.25)";
      p.style.fontWeight = "600";
    }
  });
}

async function deleteSystemTemplate(tplId) {
  try {
    const res = await fetch(`/api/templates/${encodeURIComponent(tplId)}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      showToast("Template removed from system.", "success");
      await loadSystemTemplates("kt_invitation_");
    } else {
      throw new Error(data.message);
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

// Add Template Modal Event Listeners
const btnOpenAddTemplateModal = document.getElementById("btnOpenAddTemplateModal");
const addTemplateModal = document.getElementById("addTemplateModal");
const btnCloseAddTemplateModal = document.getElementById("btnCloseAddTemplateModal");
const btnCancelAddTemplate = document.getElementById("btnCancelAddTemplate");
const btnVerifyNewTemplate = document.getElementById("btnVerifyNewTemplate");
const btnConfirmAddTemplate = document.getElementById("btnConfirmAddTemplate");
const inputNewTemplateId = document.getElementById("inputNewTemplateId");
const selectNewTemplateLang = document.getElementById("selectNewTemplateLang");
const newTemplatePreviewCard = document.getElementById("newTemplatePreviewCard");
const newTemplateAddFeedback = document.getElementById("newTemplateAddFeedback");

if (btnOpenAddTemplateModal) {
  btnOpenAddTemplateModal.addEventListener("click", () => {
    if (inputNewTemplateId) inputNewTemplateId.value = "";
    if (newTemplatePreviewCard) newTemplatePreviewCard.style.display = "none";
    if (newTemplateAddFeedback) newTemplateAddFeedback.textContent = "";
    verifiedTemplateData = null;
    addTemplateModal.classList.add("active");
  });
}

if (btnCloseAddTemplateModal) {
  btnCloseAddTemplateModal.addEventListener("click", () => {
    addTemplateModal.classList.remove("active");
  });
}
if (btnCancelAddTemplate) {
  btnCancelAddTemplate.addEventListener("click", () => {
    addTemplateModal.classList.remove("active");
  });
}

// Verify from Meta button in modal
if (btnVerifyNewTemplate) {
  btnVerifyNewTemplate.addEventListener("click", async () => {
    const inputVal = (inputNewTemplateId?.value || "").trim();
    if (!inputVal) {
      showToast("Please enter a Template ID or Name first.", "error");
      return;
    }

    btnVerifyNewTemplate.disabled = true;
    btnVerifyNewTemplate.textContent = "Verifying...";
    if (newTemplateAddFeedback) {
      newTemplateAddFeedback.textContent = "Querying Meta Cloud API...";
      newTemplateAddFeedback.style.color = "var(--text-muted)";
    }

    try {
      const res = await fetch(`/api/templates/${encodeURIComponent(inputVal)}`);
      const data = await res.json();

      if (!data.success || !data.data) {
        throw new Error(data.message || "Template not found on Meta");
      }

      verifiedTemplateData = data.data;

      // Populate preview card
      if (newTemplatePreviewCard) {
        newTemplatePreviewCard.style.display = "block";
        document.getElementById("newTemplateNameDisplay").textContent = `${verifiedTemplateData.name} (Meta ID: ${verifiedTemplateData.id || inputVal})`;
        document.getElementById("newTemplateFormatBadge").textContent = verifiedTemplateData.parameter_format || "POSITIONAL";
        document.getElementById("newTemplateMetaDetails").textContent = `Category: ${verifiedTemplateData.category || 'MARKETING'} • Language: ${verifiedTemplateData.language || 'en'} • Status: ${verifiedTemplateData.status || 'APPROVED'}`;

        const bodyPreview = document.getElementById("newTemplateBodyPreview");
        if (bodyPreview) {
          const rawBody = verifiedTemplateData.bodyText || "";
          bodyPreview.innerHTML = rawBody.replace(/\{\{([^{}]+)\}\}/g, '<span class="tpl-variable-highlight">{{$1}}</span>') || "(No body text returned)";
        }

        const varSummary = document.getElementById("newTemplateVariablesSummary");
        if (varSummary) {
          const count = verifiedTemplateData.variables?.length || 0;
          const vars = verifiedTemplateData.variables && verifiedTemplateData.variables.length > 0
            ? verifiedTemplateData.variables.map(v => v.label).join(", ")
            : "None required";
          varSummary.textContent = `${count} Variable${count === 1 ? '' : 's'} detected: ${vars}`;
        }
      }

      if (newTemplateAddFeedback) {
        newTemplateAddFeedback.textContent = `✓ Template verified from Meta! Click "Save Template" to store in system.`;
        newTemplateAddFeedback.style.color = "var(--accent-wa)";
      }
    } catch (err) {
      if (newTemplateAddFeedback) {
        newTemplateAddFeedback.textContent = `⚠️ Meta inspection note: ${err.message}. You can still save it as a manual template.`;
        newTemplateAddFeedback.style.color = "var(--status-warning)";
      }
    } finally {
      btnVerifyNewTemplate.disabled = false;
      btnVerifyNewTemplate.innerHTML = `
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        Verify from Meta
      `;
    }
  });
}

// Confirm Save Template button in modal
if (btnConfirmAddTemplate) {
  btnConfirmAddTemplate.addEventListener("click", async () => {
    const inputVal = (inputNewTemplateId?.value || "").trim();
    if (!inputVal) {
      showToast("Please enter a Template ID or Name.", "error");
      return;
    }

    const lang = selectNewTemplateLang?.value || "en";
    btnConfirmAddTemplate.disabled = true;
    btnConfirmAddTemplate.textContent = "Saving...";

    try {
      const payload = {
        templateIdOrName: inputVal,
        language: lang
      };

      // If user pre-verified, send the complete metadata
      if (verifiedTemplateData) {
        payload.name = verifiedTemplateData.name;
        payload.category = verifiedTemplateData.category;
        payload.parameter_format = verifiedTemplateData.parameter_format;
        payload.bodyText = verifiedTemplateData.bodyText;
        payload.variables = verifiedTemplateData.variables;
        payload.buttons = verifiedTemplateData.buttons;
      }

      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || "Failed to save template");
      }

      showToast(`Template '${data.data.name}' added to system!`, "success");
      addTemplateModal.classList.remove("active");

      // Reload system templates and auto-select newly added template
      await loadSystemTemplates(data.data.id || data.data.name);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btnConfirmAddTemplate.disabled = false;
      btnConfirmAddTemplate.textContent = "💾 Save Template to System";
    }
  });
}

document.getElementById("inputTextBody").addEventListener("input", updatePhoneMockup);

// Template input with debounce
document.getElementById("inputTemplateName").addEventListener("input", (e) => {
  clearTimeout(tplFetchDebounceTimer);
  const val = e.target.value.trim();
  if (!val) return;
  tplFetchDebounceTimer = setTimeout(() => {
    fetchTemplateDetails(val, true);
  }, 600);
});

// Template Inspect button
document.getElementById("btnFetchTemplate")?.addEventListener("click", () => {
  const tplInput = document.getElementById("inputTemplateName").value.trim();
  if (!tplInput) {
    showToast("Please enter a template number, ID, or name.", "error");
    return;
  }
  fetchTemplateDetails(tplInput, true);
});

// Select Stored Template from Database Dropdown
const selectSavedBroadcastTemplate = document.getElementById("selectSavedBroadcastTemplate");
if (selectSavedBroadcastTemplate) {
  selectSavedBroadcastTemplate.addEventListener("change", (e) => {
    const chosenName = e.target.value;
    if (!chosenName) return;
    const matched = savedSystemTemplates.find(t => 
      t.name.toLowerCase() === chosenName.toLowerCase() ||
      String(t.id).toLowerCase() === chosenName.toLowerCase() ||
      String(t.meta_id).toLowerCase() === chosenName.toLowerCase()
    );
    if (matched) {
      selectSystemTemplate(matched);
      showToast(`Selected stored template: ${matched.name}`, "info");
    }
  });
}

// Save Current Template to DB Button
const btnSaveCurrentTemplateToDb = document.getElementById("btnSaveCurrentTemplateToDb");
if (btnSaveCurrentTemplateToDb) {
  btnSaveCurrentTemplateToDb.addEventListener("click", async () => {
    const rawVal = document.getElementById("inputTemplateName")?.value?.trim();
    if (!rawVal) {
      showToast("Please enter a template number, ID, or name to store.", "warning");
      return;
    }

    btnSaveCurrentTemplateToDb.disabled = true;
    btnSaveCurrentTemplateToDb.textContent = "Saving to DB...";

    try {
      const payload = {
        templateIdOrName: rawVal,
        language: document.getElementById("inputTemplateLang")?.value || "en"
      };

      if (currentTemplateDetails) {
        payload.name = currentTemplateDetails.name;
        payload.category = currentTemplateDetails.category;
        payload.parameter_format = currentTemplateDetails.parameter_format;
        payload.bodyText = currentTemplateDetails.bodyText;
        payload.variables = currentTemplateDetails.variables;
      }

      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        showToast(`✓ Template '${data.data?.name || rawVal}' stored in database!`, "success");
        await loadSystemTemplates(data.data?.name || rawVal);
      } else {
        throw new Error(data.message || "Failed to store template");
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btnSaveCurrentTemplateToDb.disabled = false;
      btnSaveCurrentTemplateToDb.textContent = "💾 Save to DB";
    }
  });
}

// Auto-Map from Excel button
document.getElementById("btnAutoMapParams")?.addEventListener("click", () => {
  if (currentTemplateDetails) {
    setupTemplateParamRowsFromDetails(currentTemplateDetails);
    showToast("Auto-mapped template variables to Excel columns!", "success");
  } else {
    const tplInput = document.getElementById("inputTemplateName").value.trim();
    fetchTemplateDetails(tplInput, true);
  }
});

// Update Live Phone Mockup Preview
function updatePhoneMockup() {
  const mockupBubble = document.getElementById("mockupMessageBubble");
  const mockupName = document.getElementById("mockupRecipientName");
  const mockupPhone = document.getElementById("mockupRecipientPhone");
  const mockupTime = document.getElementById("mockupTime");

  const now = new Date();
  mockupTime.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // Sample recipient data from 1st preview row or fallback
  const firstRow = uploadedData && uploadedData.preview && uploadedData.preview[0] ? uploadedData.preview[0] : null;
  const sampleData = firstRow ? firstRow.data : {
    Name: "Shivam khomane",
    Mobile: "9307382030",
    Restaurant: "Konkan Trip Beach Resort",
    Link: "https://konkantrip.com/partner",
    City: "Alibaug",
    OfferCode: "PARTNER100"
  };

  const nameCol = document.getElementById("selectNameCol")?.value;
  mockupName.textContent = (nameCol && sampleData[nameCol]) || "Sample Contact";
  mockupPhone.textContent = (firstRow && firstRow.cleanPhone ? `+${firstRow.cleanPhone}` : "+91 98765 43210") + " • online";

  if (activeMode === "TEMPLATE") {
    const rawTemplateName = (document.getElementById("inputTemplateName")?.value || "kt_invitation_").trim();
    const cleanTpl = rawTemplateName.toLowerCase();

    // 1. Dynamic Meta Template Rendering (works for ANY template ID or custom template number)
    if (currentTemplateDetails && currentTemplateDetails.bodyText) {
      const selects = document.querySelectorAll(".param-col-select");
      const paramMap = {};

      selects.forEach((s, idx) => {
        const key = s.dataset.varKey || String(idx + 1);
        const col = s.value;
        const val = (sampleData && col && sampleData[col] !== undefined)
          ? sampleData[col]
          : (currentTemplateDetails.variables?.[idx]?.example || `{{${key}}}`);
        paramMap[key] = val;
        paramMap[String(idx + 1)] = val;
      });

      // Interpolate placeholders {{1}}, {{name}}, etc.
      let renderedBody = currentTemplateDetails.bodyText.replace(/\{\{([^{}]+)\}\}/g, (match, varName) => {
        const cleanVar = varName.trim();
        if (paramMap[cleanVar] !== undefined) {
          return `<strong>${paramMap[cleanVar]}</strong>`;
        }
        return `<strong>${match}</strong>`;
      });
      renderedBody = renderedBody.replace(/\n/g, "<br>");

      // Render button components if present (e.g. URL button, quick reply)
      let buttonsHtml = "";
      if (Array.isArray(currentTemplateDetails.buttons) && currentTemplateDetails.buttons.length > 0) {
        buttonsHtml = currentTemplateDetails.buttons.map(btn => {
          const btnText = btn.text || "Open Link";
          const btnUrl = btn.url || "https://konkantrip.com";
          return `
            <div style="padding-top: 0.5rem; margin-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.1); text-align: center;">
              <a href="${btnUrl}" target="_blank" style="display: block; padding: 0.45rem; background: rgba(83, 189, 235, 0.15); color: #53bdeb; font-size: 0.82rem; font-weight: 600; border-radius: 6px; text-decoration: none;">
                🔗 ${btnText}
              </a>
            </div>
          `;
        }).join("");
      }

      mockupBubble.innerHTML = `
        <div style="font-size: 0.72rem; color: #53bdeb; margin-bottom: 0.4rem; font-weight: 700; letter-spacing: 0.5px; display: flex; justify-content: space-between;">
          <span>${currentTemplateDetails.status || "APPROVED TEMPLATE"}</span>
          <span>${currentTemplateDetails.category || "MARKETING"}</span>
        </div>
        <div style="font-weight: 700; font-size: 0.95rem; color: #fff; margin-bottom: 0.5rem;">
          ${currentTemplateDetails.name}
        </div>
        <div style="font-size: 0.85rem; line-height: 1.45; color: #e2e8f0; margin-bottom: 0.6rem;">
          ${renderedBody}
        </div>
        ${buttonsHtml}
        <div class="wa-message-time">
          <span>${mockupTime.textContent}</span>
          <span class="wa-double-check">✓✓</span>
        </div>
      `;
      return;
    }

    // 2. Built-in Fallbacks before Meta API fetch resolves
    if (cleanTpl.includes("kt_invitation_") || cleanTpl.includes("1059862786867912") || cleanTpl.includes("invitation")) {
      const selects = document.querySelectorAll(".param-col-select");
      const paramCols = Array.from(selects).map(s => s.value);
      const p1 = (paramCols[0] && sampleData[paramCols[0]]) || sampleData["Name"] || "Shivam khomane";
      const p2 = (paramCols[1] && sampleData[paramCols[1]]) || sampleData["Restaurant"] || "Konkan Trip Beach Resort";
      const p3 = (paramCols[2] && sampleData[paramCols[2]]) || sampleData["Link"] || "https://konkantrip.com/partner";

      mockupBubble.innerHTML = `
        <div style="font-size: 0.72rem; color: #53bdeb; margin-bottom: 0.4rem; font-weight: 700; letter-spacing: 0.5px; display: flex; justify-content: space-between;">
          <span>OFFICIAL META TEMPLATE</span>
          <span>MARKETING</span>
        </div>
        <div style="font-weight: 700; font-size: 0.95rem; color: #fff; margin-bottom: 0.5rem;">
          KonkanTrip Invitation
        </div>
        <div style="font-size: 0.85rem; line-height: 1.45; color: #e2e8f0; margin-bottom: 0.6rem;">
          Hi <strong>${p1}</strong>,<br><br>
          KonkanTrip is inviting <strong>${p2}</strong> to join our restaurant partner network.<br><br>
          Create your partner profile and start receiving customer opportunities through KonkanTrip.<br><br>
          Complete your registration here: <a href="${p3}" target="_blank" style="color:#53bdeb; text-decoration: underline;">${p3}</a><br><br>
          Regards,<br>
          KonkanTrip Partner Team
        </div>
        <div class="wa-message-time">
          <span>${mockupTime.textContent}</span>
          <span class="wa-double-check">✓✓</span>
        </div>
      `;
    } else if (cleanTpl.includes("restaurant") || cleanTpl.includes("1757343188867100")) {
      mockupBubble.innerHTML = `
        <div style="font-size: 0.72rem; color: #53bdeb; margin-bottom: 0.4rem; font-weight: 700; letter-spacing: 0.5px; display: flex; justify-content: space-between;">
          <span>OFFICIAL META TEMPLATE</span>
          <span>MARKETING</span>
        </div>
        <div style="font-weight: 700; font-size: 0.95rem; color: #fff; margin-bottom: 0.5rem;">
          KonkanTrip Invitation
        </div>
        <div style="font-size: 0.85rem; line-height: 1.45; color: #e2e8f0; margin-bottom: 0.6rem;">
          Hi,<br><br>
          KonkanTrip is inviting you to join our restaurant partner network.<br><br>
          Create your partner profile and start receiving customer opportunities through KonkanTrip.<br><br>
          Complete your registration here: <span style="color:#53bdeb;">https://konkantrip.com/</span><br><br>
          Regards,<br>
          KonkanTrip Partner Team
        </div>
        <div style="padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.1); text-align: center;">
          <a href="https://konkantrip.com/" target="_blank" style="display: block; padding: 0.45rem; background: rgba(83, 189, 235, 0.15); color: #53bdeb; font-size: 0.82rem; font-weight: 600; border-radius: 6px; text-decoration: none;">
            🔗 Register Now
          </a>
        </div>
        <div class="wa-message-time">
          <span>${mockupTime.textContent}</span>
          <span class="wa-double-check">✓✓</span>
        </div>
      `;
    } else if (cleanTpl.includes("auth")) {
      const authCode = sampleData["Name"] ? "492018" : "123456";
      mockupBubble.innerHTML = `
        <div style="font-size: 0.72rem; color: #53bdeb; margin-bottom: 0.35rem; font-weight: 700;">
          AUTHENTICATION (OTP)
        </div>
        <div style="font-size: 0.85rem; line-height: 1.45; color: #e2e8f0; margin-bottom: 0.6rem;">
          Your KonkanTrip verification code is <strong>${authCode}</strong>. Do not share this code with anyone.
        </div>
        <div style="padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.1); text-align: center;">
          <div style="padding: 0.4rem; background: rgba(83, 189, 235, 0.15); color: #53bdeb; font-size: 0.82rem; font-weight: 600; border-radius: 6px;">
            📋 Copy Code
          </div>
        </div>
        <div class="wa-message-time">
          <span>${mockupTime.textContent}</span>
          <span class="wa-double-check">✓✓</span>
        </div>
      `;
    } else {
      const selects = document.querySelectorAll(".param-col-select");
      const paramValues = Array.from(selects).map((s, idx) => {
        const col = s.value;
        const val = sampleData[col] !== undefined ? sampleData[col] : `Param_${idx + 1}`;
        return `{{${idx + 1}}} -> ${val}`;
      });

      let previewContent = `[Meta Template: ${rawTemplateName}]\n`;
      if (paramValues.length > 0) {
        previewContent += `Mapped Parameters:\n` + paramValues.join("\n");
      } else {
        previewContent += "(No dynamic parameters specified)";
      }

      mockupBubble.innerHTML = `
        <div style="font-size: 0.72rem; color: #53bdeb; margin-bottom: 0.35rem; font-weight: 600;">OFFICIAL META TEMPLATE</div>
        <div style="white-space: pre-wrap; font-size: 0.85rem; line-height: 1.45;">${previewContent}</div>
        <div class="wa-message-time">
          <span>${mockupTime.textContent}</span>
          <span class="wa-double-check">✓✓</span>
        </div>
      `;
    }
  } else {
    // Custom text mode
    let text = document.getElementById("inputTextBody").value;
    if (!text) {
      text = "Hi {{Name}},\n\nKonkanTrip is inviting {{Restaurant}} to join our restaurant partner network.\n\nCreate your partner profile and start receiving customer opportunities through KonkanTrip.\n\nComplete your registration here: https://konkantrip.com/\n\nRegards,\nKonkanTrip Partner Team";
    }

    // Interpolate sample data
    let rendered = text.replace(/\{\{?([^{}]+)\}?\}/g, (match, key) => {
      const trimmed = key.trim();
      return sampleData[trimmed] !== undefined ? sampleData[trimmed] : match;
    });

    mockupBubble.innerHTML = `
      ${rendered}
      <div class="wa-message-time">
        <span>${mockupTime.textContent}</span>
        <span class="wa-double-check">✓✓</span>
      </div>
    `;
  }
}

// Throttle delay slider
const sliderDelay = document.getElementById("sliderDelay");
const labelDelayValue = document.getElementById("labelDelayValue");
sliderDelay.addEventListener("input", () => {
  labelDelayValue.textContent = `${sliderDelay.value} ms`;
});

// Single Test Message Sender
document.getElementById("btnSendTest").addEventListener("click", async () => {
  const testPhone = document.getElementById("inputTestPhone").value.trim();
  if (!testPhone) {
    showToast("Please enter a phone number to test.", "error");
    return;
  }

  const btn = document.getElementById("btnSendTest");
  btn.disabled = true;
  btn.textContent = "Sending...";

  try {
    let payload = {
      phone: testPhone,
      messageType: activeMode
    };

    if (activeMode === "TEMPLATE") {
      let tplName = document.getElementById("inputTemplateName").value.trim();
      let tplLang = document.getElementById("inputTemplateLang").value;

      if (tplName === "1059862786867912" || tplName === "kt_invitation_" || tplName.toLowerCase().includes("invitation")) {
        tplName = "kt_invitation_";
        tplLang = "en";
        const selects = document.querySelectorAll(".param-col-select");
        const sampleData = uploadedData?.preview?.[0]?.data || {
          Name: "Shivam khomane",
          Restaurant: "Konkan Trip Beach Resort",
          Link: "https://konkantrip.com/partner"
        };
        const paramVals = Array.from(selects).map(s => String(sampleData[s.value] || ""));
        payload.components = [{
          type: "body",
          parameters: [
            { type: "text", text: paramVals[0] || sampleData.Name || "Shivam khomane" },
            { type: "text", text: paramVals[1] || sampleData.Restaurant || "Konkan Trip Beach Resort" },
            { type: "text", text: paramVals[2] || sampleData.Link || "https://konkantrip.com/partner" }
          ]
        }];
      } else if (tplName === "1757343188867100" || tplName.toLowerCase().includes("restaurant")) {
        tplName = "kt_restaurant_invitation";
        tplLang = "en";
        payload.components = [];
      } else {
        const selects = document.querySelectorAll(".param-col-select");
        const sampleData = uploadedData?.preview?.[0]?.data || {};
        payload.components = [{
          type: "body",
          parameters: Array.from(selects).map(s => ({
            type: "text",
            text: String(sampleData[s.value] || "Test Value")
          }))
        }];
      }
    } else {
      let bodyText = document.getElementById("inputTextBody").value.trim();
      const sampleData = uploadedData?.preview?.[0]?.data || { Name: "Test User" };
      bodyText = bodyText.replace(/\{\{?([^{}]+)\}?\}/g, (match, key) => {
        const trimmed = key.trim();
        return sampleData[trimmed] !== undefined ? sampleData[trimmed] : match;
      });
      payload.messageBody = bodyText || "Test message from WhatsApp Bulk Pro";
    }

    const res = await fetch("/api/broadcast/test-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message);
    }

    showToast(`Test message sent successfully to ${testPhone}!`, "success");
  } catch (err) {
    console.error("Test send error:", err);
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Send Test";
  }
});

// Download Demo Excel Template
const btnDownloadTpl = document.getElementById("btnDownloadTemplate");
if (btnDownloadTpl) {
  btnDownloadTpl.addEventListener("click", () => {
    showToast("Downloading sample Excel template...", "success");
  });
}

// Local ISO string helper for datetime-local
function toLocalISOString(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${y}-${m}-${d}T${h}:${min}`;
}

// Relative time string helper
function getRelativeTimeStr(dateInput) {
  if (!dateInput) return "";
  const target = new Date(dateInput);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return "Due now / in progress";

  const diffMins = Math.round(diffMs / (60 * 1000));
  if (diffMins < 60) return `in ${diffMins} min${diffMins === 1 ? '' : 's'}`;
  const diffHours = Math.floor(diffMins / 60);
  const remMins = diffMins % 60;
  if (diffHours < 24) {
    return remMins > 0 ? `in ${diffHours} hr ${remMins} min` : `in ${diffHours} hour${diffHours === 1 ? '' : 's'}`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `in ${diffDays} day${diffDays === 1 ? '' : 's'}`;
}

// Escape attribute helper
function escapeAttr(str) {
  return String(str || "").replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function updateScheduleSummary(inputElem, summaryElem) {
  if (!inputElem || !summaryElem) return;
  const val = inputElem.value;
  if (!val) {
    summaryElem.textContent = "Please select a future date & time above.";
    summaryElem.style.color = "var(--text-muted)";
    return;
  }
  const target = new Date(val);
  const now = new Date();
  if (target <= now) {
    summaryElem.innerHTML = "⚠️ <strong>Warning:</strong> Selected time is in the past! Please pick a future date & time.";
    summaryElem.style.color = "var(--status-danger)";
  } else {
    const formatted = target.toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    summaryElem.innerHTML = `Broadcast will automatically trigger on <strong>${formatted}</strong> (${getRelativeTimeStr(target)}).`;
    summaryElem.style.color = "#d8b4fe";
  }
}

// Dispatch Mode Selector (NOW vs SCHEDULE)
const btnDispatchNow = document.getElementById("btnDispatchNow");
const btnDispatchSchedule = document.getElementById("btnDispatchSchedule");
const scheduleSettingsArea = document.getElementById("scheduleSettingsArea");
const inputScheduledAt = document.getElementById("inputScheduledAt");
const scheduleSummaryText = document.getElementById("scheduleSummaryText");
const btnStartBroadcastText = document.getElementById("btnStartBroadcastText");

if (btnDispatchNow && btnDispatchSchedule) {
  btnDispatchNow.addEventListener("click", () => {
    activeDispatchMode = "NOW";
    btnDispatchNow.classList.add("active");
    btnDispatchSchedule.classList.remove("active");
    if (scheduleSettingsArea) scheduleSettingsArea.style.display = "none";
    if (btnStartBroadcastText) btnStartBroadcastText.textContent = "Create & Start WhatsApp Broadcast Now";
  });

  btnDispatchSchedule.addEventListener("click", () => {
    activeDispatchMode = "SCHEDULE";
    btnDispatchSchedule.classList.add("active");
    btnDispatchNow.classList.remove("active");
    if (scheduleSettingsArea) scheduleSettingsArea.style.display = "block";
    if (btnStartBroadcastText) btnStartBroadcastText.textContent = "📅 Schedule WhatsApp Broadcast for Later";

    if (inputScheduledAt && !inputScheduledAt.value) {
      const defaultDate = new Date(Date.now() + 30 * 60 * 1000);
      inputScheduledAt.value = toLocalISOString(defaultDate);
      inputScheduledAt.min = toLocalISOString(new Date());
    }
    updateScheduleSummary(inputScheduledAt, scheduleSummaryText);
  });
}

if (inputScheduledAt) {
  inputScheduledAt.min = toLocalISOString(new Date());
  inputScheduledAt.addEventListener("input", () => {
    updateScheduleSummary(inputScheduledAt, scheduleSummaryText);
  });
}

// Preset chips in step 3
document.querySelectorAll(".preset-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    const offsetMins = chip.dataset.offsetMins;
    const preset = chip.dataset.preset;
    let target = new Date();

    if (offsetMins) {
      target = new Date(Date.now() + parseInt(offsetMins, 10) * 60 * 1000);
    } else if (preset === "tomorrow-morning") {
      target.setDate(target.getDate() + 1);
      target.setHours(10, 0, 0, 0);
    } else if (preset === "tomorrow-evening") {
      target.setDate(target.getDate() + 1);
      target.setHours(18, 0, 0, 0);
    }

    if (inputScheduledAt) {
      inputScheduledAt.value = toLocalISOString(target);
      updateScheduleSummary(inputScheduledAt, scheduleSummaryText);
    }
  });
});

// Start Broadcast Campaign (Send Now OR Schedule for Later)
document.getElementById("btnStartBroadcast").addEventListener("click", async () => {
  if (!uploadedData || !uploadedData.allRows || uploadedData.allRows.length === 0) {
    showToast("Please upload an Excel contact file first.", "error");
    return;
  }

  const campaignName = document.getElementById("inputCampaignName").value.trim();
  if (!campaignName) {
    showToast("Please provide a campaign name.", "error");
    return;
  }

  const phoneCol = document.getElementById("selectPhoneCol").value;
  const nameCol = document.getElementById("selectNameCol").value;
  const delayMs = parseInt(sliderDelay.value, 10);

  let tplName = (currentTemplateDetails?.name || document.getElementById("inputTemplateName").value).trim();
  let tplLang = (currentTemplateDetails?.language || document.getElementById("inputTemplateLang").value).trim();

  // Handle template aliases
  if (tplName === "1059862786867912" || tplName.toLowerCase().includes("kt_invitation_")) {
    tplName = "kt_invitation_";
    tplLang = "en";
  } else if (tplName === "1757343188867100" || tplName.toLowerCase().includes("kt_restaurant_invitation")) {
    tplName = "kt_restaurant_invitation";
    tplLang = "en";
  }

  // Extract mapped parameters
  const selects = document.querySelectorAll(".param-col-select");
  const paramKeys = [];
  const bodyParams = Array.from(selects).map(s => {
    const key = s.dataset.varKey || "";
    paramKeys.push(key);
    return {
      key: key,
      col: s.value
    };
  });

  // Check dispatch mode
  let scheduleMode = activeDispatchMode;
  let scheduledAt = null;

  if (activeDispatchMode === "SCHEDULE") {
    const schedVal = inputScheduledAt ? inputScheduledAt.value : "";
    if (!schedVal) {
      showToast("Please select a scheduled date and time.", "error");
      return;
    }
    const schedDate = new Date(schedVal);
    if (isNaN(schedDate.getTime()) || schedDate <= new Date()) {
      showToast("Please choose a future date & time to schedule.", "error");
      return;
    }
    scheduledAt = schedDate.toISOString();
  }

  const payload = {
    name: campaignName,
    fileName: uploadedData.filename,
    phoneColumn: phoneCol,
    nameColumn: nameCol,
    messageType: activeMode,
    templateName: tplName,
    templateLanguage: tplLang,
    messageBody: document.getElementById("inputTextBody").value.trim(),
    mappingConfig: {
      bodyParams,
      paramKeys,
      parameterFormat: currentTemplateDetails?.parameter_format || "POSITIONAL"
    },
    delayMs: delayMs,
    contacts: uploadedData.allRows.map(r => r.data),
    scheduleMode: scheduleMode,
    scheduledAt: scheduledAt
  };

  const btn = document.getElementById("btnStartBroadcast");
  btn.disabled = true;
  btn.textContent = scheduleMode === "SCHEDULE" ? "Scheduling Campaign..." : "Initializing Campaign...";

  try {
    // 1. Create campaign in SQLite
    const createRes = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const createData = await createRes.json();
    if (!createData.success) {
      throw new Error(createData.message);
    }

    const campaign = createData.data;
    activeCampaignId = campaign.id;

    // Handle Scheduled Campaign
    if (scheduleMode === "SCHEDULE") {
      const formattedDate = new Date(campaign.scheduled_at).toLocaleString();
      showToast(`Campaign scheduled successfully for ${formattedDate}!`, "success");
      // Switch to Campaigns tab
      const tabCampaigns = document.querySelector('[data-tab="tab-campaigns"]');
      if (tabCampaigns) tabCampaigns.click();
      loadCampaignsList();
      return;
    }

    // Handle Immediate Broadcast
    document.getElementById("liveMonitorArea").style.display = "block";
    document.getElementById("liveCampaignTitle").textContent = `Campaign: ${campaign.name}`;
    document.getElementById("liveCountSent").textContent = "0";
    document.getElementById("liveCountFailed").textContent = "0";
    document.getElementById("liveCountPending").textContent = String(campaign.valid_contacts);
    document.getElementById("liveProgressBar").style.width = "0%";
    document.getElementById("liveProgressPercent").textContent = "0%";
    document.getElementById("liveLogsConsole").innerHTML = "";

    broadcastStartTime = Date.now();

    // Connect Server-Sent Events (SSE)
    initSSE();

    // Start broadcasting
    const startRes = await fetch(`/api/campaigns/${campaign.id}/start`, { method: "POST" });
    const startData = await startRes.json();
    if (!startData.success) {
      throw new Error(startData.message);
    }

    showToast(`Broadcast started for ${campaign.valid_contacts} contacts!`, "success");
  } catch (err) {
    console.error("Start broadcast error:", err);
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" id="btnStartBroadcastIcon">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
      <span id="btnStartBroadcastText">${activeDispatchMode === 'SCHEDULE' ? '📅 Schedule WhatsApp Broadcast for Later' : 'Create & Start WhatsApp Broadcast Now'}</span>
    `;
  }
});

// SSE Live Progress Listener
function initSSE() {
  if (sseSource) {
    sseSource.close();
  }

  sseSource = new EventSource("/api/broadcast/stream");

  sseSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === "progress") {
        handleProgressEvent(data);
      } else if (data.type === "status") {
        handleStatusEvent(data);
      } else if (data.type === "reply") {
        handleIncomingReplySSE(data.data);
      } else if (data.type === "reply_updated") {
        if (typeof loadCustomerReplies === "function") {
          loadCustomerReplies();
        }
      } else if (data.type === "webhook_status") {
        // Delivery status update received
        if (typeof loadCampaignsList === "function") {
          // silently refresh campaign stats if on campaigns tab
          const activeTab = document.querySelector(".nav-tab.active");
          if (activeTab && activeTab.getAttribute("data-tab") === "tab-campaigns") {
            loadCampaignsList();
          }
        }
      }
    } catch (e) {
      // heartbeats or non-JSON
    }
  };

  sseSource.onerror = () => {
    console.warn("SSE connection interrupted, browser will auto-reconnect.");
  };
}

function handleProgressEvent(data) {
  if (!activeCampaignId || data.campaignId !== activeCampaignId) return;

  const logsConsole = document.getElementById("liveLogsConsole");
  const logDiv = document.createElement("div");
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  if (data.status === "SENT") {
    logDiv.className = "log-entry sent";
    logDiv.innerHTML = `<span class="log-time">[${timeStr}]</span> <span>✓ Sent to ${data.name || ''} (+${data.phone}) - ID: ${data.messageId || 'OK'}</span>`;
  } else {
    logDiv.className = "log-entry failed";
    logDiv.innerHTML = `<span class="log-time">[${timeStr}]</span> <span>✗ Failed to ${data.name || ''} (+${data.phone}): ${data.error || 'Unknown error'}</span>`;
  }

  logsConsole.prepend(logDiv);

  // Update counters
  const currentSent = parseInt(document.getElementById("liveCountSent").textContent, 10) + (data.status === "SENT" ? 1 : 0);
  const currentFailed = parseInt(document.getElementById("liveCountFailed").textContent, 10) + (data.status === "FAILED" ? 1 : 0);
  const total = uploadedData ? uploadedData.validRows : (currentSent + currentFailed);
  const remaining = Math.max(0, total - (currentSent + currentFailed));

  document.getElementById("liveCountSent").textContent = String(currentSent);
  document.getElementById("liveCountFailed").textContent = String(currentFailed);
  document.getElementById("liveCountPending").textContent = String(remaining);

  const pct = Math.round(((currentSent + currentFailed) / (total || 1)) * 100);
  document.getElementById("liveProgressBar").style.width = `${pct}%`;
  document.getElementById("liveProgressPercent").textContent = `${pct}%`;

  // Calculate speed (msgs/sec)
  if (broadcastStartTime) {
    const elapsedSec = (Date.now() - broadcastStartTime) / 1000;
    if (elapsedSec > 1) {
      const speed = ((currentSent + currentFailed) / elapsedSec).toFixed(1);
      document.getElementById("liveSpeed").textContent = `${speed} /s`;
    }
  }
}

function handleStatusEvent(data) {
  if (!activeCampaignId || data.campaignId !== activeCampaignId) return;

  const statusLabel = document.getElementById("liveCampaignStatus");
  statusLabel.textContent = data.status;

  if (data.status === "COMPLETED") {
    statusLabel.style.color = "var(--accent-wa)";
    showToast(data.message || "Campaign completed successfully!", "success");
    document.getElementById("btnPauseBroadcast").style.display = "none";
    document.getElementById("btnResumeBroadcast").style.display = "none";
  } else if (data.status === "PAUSED") {
    statusLabel.style.color = "var(--status-warning)";
    document.getElementById("btnPauseBroadcast").style.display = "none";
    document.getElementById("btnResumeBroadcast").style.display = "inline-flex";
  } else if (data.status === "RUNNING") {
    statusLabel.style.color = "var(--accent-wa)";
    document.getElementById("btnPauseBroadcast").style.display = "inline-flex";
    document.getElementById("btnResumeBroadcast").style.display = "none";
  } else if (data.status === "CANCELLED") {
    statusLabel.style.color = "var(--status-danger)";
    showToast("Campaign stopped.", "error");
  }
}

// Pause, Resume, Stop controls
document.getElementById("btnPauseBroadcast").addEventListener("click", async () => {
  if (!activeCampaignId) return;
  await fetch(`/api/campaigns/${activeCampaignId}/pause`, { method: "POST" });
});

document.getElementById("btnResumeBroadcast").addEventListener("click", async () => {
  if (!activeCampaignId) return;
  await fetch(`/api/campaigns/${activeCampaignId}/resume`, { method: "POST" });
});

document.getElementById("btnCancelBroadcast").addEventListener("click", async () => {
  if (!activeCampaignId) return;
  if (confirm("Are you sure you want to stop this broadcast? Remaining contacts will not be messaged.")) {
    await fetch(`/api/campaigns/${activeCampaignId}/cancel`, { method: "POST" });
  }
});

// Load Campaigns History
// Load Campaigns History
async function loadCampaignsList() {
  const tbody = document.getElementById("campaignsTableBody");
  tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Loading campaigns...</td></tr>`;

  try {
    const res = await fetch("/api/campaigns");
    const data = await res.json();

    if (!data.success || !data.data || data.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No campaigns found yet. Create your first broadcast above!</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    data.data.forEach(c => {
      const isScheduled = c.status === "SCHEDULED";
      const createdDateStr = new Date(c.created_at).toLocaleString();
      const schedDateStr = c.scheduled_at ? new Date(c.scheduled_at).toLocaleString() : null;

      let dateHtml = `<div style="font-size: 0.76rem; color: var(--text-muted);">${createdDateStr}</div>`;
      if (isScheduled && schedDateStr) {
        dateHtml = `
          <div style="font-size: 0.78rem; font-weight: 600; color: #d8b4fe;">📅 ${schedDateStr}</div>
          <div style="font-size: 0.72rem; color: var(--accent-cyan); font-weight: 500;">${getRelativeTimeStr(c.scheduled_at)}</div>
        `;
      }

      let badgeClass = "badge-pending";
      if (c.status === "COMPLETED") badgeClass = "badge-completed";
      else if (c.status === "RUNNING") badgeClass = "badge-running";
      else if (c.status === "SCHEDULED") badgeClass = "badge-scheduled";
      else if (c.status === "FAILED" || c.status === "CANCELLED") badgeClass = "badge-failed";

      let actionButtonsHtml = "";
      if (isScheduled) {
        actionButtonsHtml = `
          <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
            <button class="btn btn-primary btn-sm" onclick="runScheduledCampaignNow('${c.id}')" title="Dispatch broadcast immediately right now" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">
              ⚡ Run Now
            </button>
            <button class="btn btn-secondary btn-sm" onclick="openRescheduleModal('${c.id}', '${c.scheduled_at || ''}', '${escapeAttr(c.name)}')" title="Change scheduled time" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">
              🕒 Reschedule
            </button>
            <button class="btn btn-danger btn-sm" onclick="cancelScheduledCampaign('${c.id}')" title="Cancel scheduled broadcast" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">
              ✕
            </button>
          </div>
        `;
      } else {
        actionButtonsHtml = `
          <div style="display: flex; gap: 0.4rem;">
            <a href="/api/campaigns/${c.id}/export" class="btn btn-secondary btn-sm" title="Download Excel Delivery Report">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"></path>
              </svg>
              Excel
            </a>
            <button class="btn btn-secondary btn-sm" onclick="viewCampaignDetails('${c.id}')" title="View details">Logs</button>
            <button class="btn btn-danger btn-sm" onclick="deleteCampaign('${c.id}')" title="Delete">&times;</button>
          </div>
        `;
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${dateHtml}</td>
        <td style="font-weight: 600;">${c.name}</td>
        <td><span style="font-size: 0.72rem; padding: 0.15rem 0.45rem; background: rgba(255,255,255,0.05); border-radius: 4px;">${c.message_type}</span></td>
        <td><strong>${c.total_contacts}</strong></td>
        <td style="color: var(--status-success); font-weight: 600;">${c.sent_count}</td>
        <td style="color: var(--status-danger); font-weight: 600;">${c.failed_count}</td>
        <td><span class="badge ${badgeClass}">${c.status}</span></td>
        <td>${actionButtonsHtml}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--status-danger); padding: 1.5rem;">Failed to load campaigns: ${err.message}</td></tr>`;
  }
}

document.getElementById("btnRefreshCampaigns").addEventListener("click", loadCampaignsList);

// Reschedule Modal Functions
window.openRescheduleModal = function(campaignId, currentScheduledAt, campaignName) {
  activeRescheduleCampaignId = campaignId;
  const modal = document.getElementById("rescheduleModal");
  const nameElem = document.getElementById("rescheduleCampaignName");
  const inputElem = document.getElementById("inputRescheduleTime");
  const summaryElem = document.getElementById("rescheduleSummaryText");

  if (nameElem) nameElem.textContent = campaignName || `Campaign #${campaignId}`;
  if (inputElem) {
    inputElem.min = toLocalISOString(new Date());
    const initialDate = currentScheduledAt ? new Date(currentScheduledAt) : new Date(Date.now() + 30 * 60 * 1000);
    inputElem.value = toLocalISOString(initialDate);
  }
  updateScheduleSummary(inputElem, summaryElem);
  modal.classList.add("active");
};

window.runScheduledCampaignNow = async function(campaignId) {
  if (!confirm("Are you sure you want to trigger this scheduled broadcast immediately now?")) {
    return;
  }
  try {
    const res = await fetch(`/api/campaigns/${campaignId}/run-now`, { method: "POST" });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    showToast("Broadcast triggered immediately!", "success");
    activeCampaignId = campaignId;

    // Switch to Broadcast tab and open live monitor
    document.querySelector('[data-tab="tab-broadcast"]')?.click();
    document.getElementById("liveMonitorArea").style.display = "block";
    document.getElementById("liveCampaignTitle").textContent = `Campaign: ${data.data?.name || campaignId}`;
    initSSE();
  } catch (err) {
    showToast(err.message, "error");
  }
};

window.cancelScheduledCampaign = async function(campaignId) {
  if (!confirm("Are you sure you want to cancel this scheduled broadcast?")) {
    return;
  }
  try {
    const res = await fetch(`/api/campaigns/${campaignId}/cancel`, { method: "POST" });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    showToast("Scheduled campaign cancelled.", "success");
    loadCampaignsList();
  } catch (err) {
    showToast(err.message, "error");
  }
};

// Reschedule Modal controls
const btnCloseRescheduleModal = document.getElementById("btnCloseRescheduleModal");
const btnCancelReschedule = document.getElementById("btnCancelReschedule");
const btnConfirmReschedule = document.getElementById("btnConfirmReschedule");
const inputRescheduleTime = document.getElementById("inputRescheduleTime");
const rescheduleSummaryText = document.getElementById("rescheduleSummaryText");

if (btnCloseRescheduleModal) {
  btnCloseRescheduleModal.addEventListener("click", () => {
    document.getElementById("rescheduleModal").classList.remove("active");
  });
}
if (btnCancelReschedule) {
  btnCancelReschedule.addEventListener("click", () => {
    document.getElementById("rescheduleModal").classList.remove("active");
  });
}

if (inputRescheduleTime) {
  inputRescheduleTime.addEventListener("input", () => {
    updateScheduleSummary(inputRescheduleTime, rescheduleSummaryText);
  });
}

// Modal preset chips
document.querySelectorAll(".modal-preset").forEach(chip => {
  chip.addEventListener("click", () => {
    const offsetMins = chip.dataset.offsetMins;
    const preset = chip.dataset.preset;
    let target = new Date();

    if (offsetMins) {
      target = new Date(Date.now() + parseInt(offsetMins, 10) * 60 * 1000);
    } else if (preset === "tomorrow-morning") {
      target.setDate(target.getDate() + 1);
      target.setHours(10, 0, 0, 0);
    }

    if (inputRescheduleTime) {
      inputRescheduleTime.value = toLocalISOString(target);
      updateScheduleSummary(inputRescheduleTime, rescheduleSummaryText);
    }
  });
});

if (btnConfirmReschedule) {
  btnConfirmReschedule.addEventListener("click", async () => {
    if (!activeRescheduleCampaignId) return;
    const val = inputRescheduleTime ? inputRescheduleTime.value : "";
    if (!val) {
      showToast("Please select a date and time.", "error");
      return;
    }
    const target = new Date(val);
    if (isNaN(target.getTime()) || target <= new Date()) {
      showToast("Please choose a future date & time.", "error");
      return;
    }

    btnConfirmReschedule.disabled = true;
    btnConfirmReschedule.textContent = "Updating...";

    try {
      const res = await fetch(`/api/campaigns/${activeRescheduleCampaignId}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: target.toISOString() })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      showToast("Campaign rescheduled successfully!", "success");
      document.getElementById("rescheduleModal").classList.remove("active");
      loadCampaignsList();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btnConfirmReschedule.disabled = false;
      btnConfirmReschedule.textContent = "Save New Schedule";
    }
  });
}

// View Campaign Details Modal
window.viewCampaignDetails = async function (campaignId) {
  const modal = document.getElementById("campaignDetailsModal");
  modal.classList.add("active");

  const tbody = document.getElementById("detailModalTableBody");
  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 1rem;">Loading delivery logs...</td></tr>`;

  try {
    const res = await fetch(`/api/campaigns/${campaignId}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    const { campaign, recipients } = data.data;
    document.getElementById("detailModalTitle").textContent = `Delivery Report: ${campaign.name}`;
    document.getElementById("detailModalSummary").innerHTML = `
      Type: <strong>${campaign.message_type}</strong> | Total: <strong>${campaign.total_contacts}</strong> | 
      Sent: <strong style="color:var(--status-success);">${campaign.sent_count}</strong> | 
      Failed: <strong style="color:var(--status-danger);">${campaign.failed_count}</strong>
    `;

    tbody.innerHTML = "";
    recipients.forEach((r, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${r.contact_name || "—"}</td>
        <td><code>+${r.clean_phone}</code></td>
        <td><span class="badge ${r.status === 'SENT' ? 'badge-sent' : (r.status === 'FAILED' ? 'badge-failed' : 'badge-pending')}">${r.status}</span></td>
        <td style="font-size: 0.75rem; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${r.error_message || r.meta_message_id || ''}">
          ${r.error_message ? `<span style="color:#f87171;">${r.error_message}</span>` : `<span style="color:#60a5fa;">ID: ${r.meta_message_id || 'Delivered'}</span>`}
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red; padding: 1rem;">${err.message}</td></tr>`;
  }
};

window.deleteCampaign = async function (campaignId) {
  if (confirm("Are you sure you want to delete this campaign and its recipient logs?")) {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        showToast("Campaign deleted successfully.", "success");
        loadCampaignsList();
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      showToast(err.message, "error");
    }
  }
};

document.getElementById("btnCloseDetailsModal").addEventListener("click", () => {
  document.getElementById("campaignDetailsModal").classList.remove("active");
});
document.getElementById("btnCloseDetailsBtn").addEventListener("click", () => {
  document.getElementById("campaignDetailsModal").classList.remove("active");
});

// Settings Modal
btnOpenSettings.addEventListener("click", async () => {
  settingsModal.classList.add("active");
  settingsTestFeedback.style.display = "none";

  try {
    const res = await fetch("/api/settings");
    const data = await res.json();
    if (data.success) {
      document.getElementById("settingToken").value = data.data.WHATSAPP_API_TOKEN || "";
      document.getElementById("settingPhoneId").value = data.data.WHATSAPP_PHONE_NUMBER_ID || "";
      document.getElementById("settingCountryCode").value = data.data.DEFAULT_COUNTRY_CODE || "91";
      document.getElementById("settingDelay").value = data.data.BROADCAST_DELAY_MS || "250";
      if (document.getElementById("settingTemplateId")) {
        document.getElementById("settingTemplateId").value = data.data.WHATSAPP_TEMPLATE_ID || "1059862786867912";
      }
      if (document.getElementById("settingTemplateName")) {
        document.getElementById("settingTemplateName").value = data.data.DEFAULT_TEMPLATE_NAME || "kt_invitation_";
      }
      if (document.getElementById("settingAppTimezone")) {
        document.getElementById("settingAppTimezone").value = data.data.APP_TIMEZONE || "Asia/Kolkata";
      }
    }
  } catch (e) {
    console.error("Failed to load settings:", e);
  }
});

btnCloseSettings.addEventListener("click", () => {
  settingsModal.classList.remove("active");
});

// Test Meta Connection Button inside Settings
btnTestMetaConnection.addEventListener("click", async () => {
  const token = document.getElementById("settingToken").value.trim();
  const phoneNumberId = document.getElementById("settingPhoneId").value.trim();

  btnTestMetaConnection.disabled = true;
  btnTestMetaConnection.textContent = "Connecting to Meta...";
  settingsTestFeedback.style.display = "none";

  try {
    const res = await fetch("/api/settings/test-connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, phoneNumberId })
    });

    const data = await res.json();
    settingsTestFeedback.style.display = "block";

    if (data.success) {
      settingsTestFeedback.style.background = "rgba(16, 185, 129, 0.15)";
      settingsTestFeedback.style.border = "1px solid rgba(16, 185, 129, 0.4)";
      settingsTestFeedback.style.color = "#34d399";
      settingsTestFeedback.innerHTML = `
        <strong>✓ Connection Verified!</strong><br>
        Business Name: <strong>${data.data.verifiedName}</strong><br>
        Display Number: <strong>${data.data.displayPhoneNumber}</strong><br>
        Quality Rating: <strong>${data.data.qualityRating}</strong>
      `;
      checkMetaStatus();
    } else {
      settingsTestFeedback.style.background = "rgba(239, 68, 68, 0.15)";
      settingsTestFeedback.style.border = "1px solid rgba(239, 68, 68, 0.4)";
      settingsTestFeedback.style.color = "#f87171";
      settingsTestFeedback.innerHTML = `
        <strong>✗ Connection Failed:</strong><br>
        ${data.message}<br>
        ${data.hint ? `<span style="font-size:0.75rem; color:#fca5a5;">Hint: ${data.hint}</span>` : ""}
      `;
    }
  } catch (err) {
    settingsTestFeedback.style.display = "block";
    settingsTestFeedback.style.background = "rgba(239, 68, 68, 0.15)";
    settingsTestFeedback.style.border = "1px solid rgba(239, 68, 68, 0.4)";
    settingsTestFeedback.style.color = "#f87171";
    settingsTestFeedback.textContent = err.message;
  } finally {
    btnTestMetaConnection.disabled = false;
    btnTestMetaConnection.textContent = "Test Meta Connection";
  }
});

// Save Settings Button
btnSaveSettings.addEventListener("click", async () => {
  const payload = {
    WHATSAPP_API_TOKEN: document.getElementById("settingToken").value.trim(),
    WHATSAPP_PHONE_NUMBER_ID: document.getElementById("settingPhoneId").value.trim(),
    DEFAULT_COUNTRY_CODE: document.getElementById("settingCountryCode").value.trim(),
    BROADCAST_DELAY_MS: document.getElementById("settingDelay").value.trim(),
    WHATSAPP_TEMPLATE_ID: (document.getElementById("settingTemplateId")?.value || "1059862786867912").trim(),
    DEFAULT_TEMPLATE_NAME: (document.getElementById("settingTemplateName")?.value || "kt_invitation_").trim(),
    APP_TIMEZONE: (document.getElementById("settingAppTimezone")?.value || "Asia/Kolkata").trim()
  };

  try {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      showToast("Settings updated successfully!", "success");
      settingsModal.classList.remove("active");
      checkMetaStatus();
      syncSystemTime();
    } else {
      throw new Error(data.message);
    }
  } catch (err) {
    showToast(err.message, "error");
  }
});

metaStatusPill.addEventListener("click", () => {
  btnOpenSettings.click();
});

// =========================================================================
// SYSTEM DATE & TIME SYNCHRONIZATION (DEPLOYMENTS + LOCAL)
// =========================================================================

let serverTimeSkewMs = 0;
let serverTimezone = "Asia/Kolkata";
let serverTimeData = null;
let systemClockInterval = null;

async function syncSystemTime() {
  try {
    const startFetch = Date.now();
    const res = await fetch("/api/system/time");
    const json = await res.json();
    const endFetch = Date.now();
    const latency = Math.round((endFetch - startFetch) / 2);

    if (json.success && json.data) {
      serverTimeData = json.data;
      serverTimezone = json.data.timezone || "Asia/Kolkata";
      serverTimeSkewMs = (json.data.timestamp + latency) - Date.now();

      updateSystemClockDisplay();

      // Update badge
      const tzBadge = document.getElementById("systemTzBadge");
      if (tzBadge) {
        let tzAbbr = "IST";
        if (serverTimezone.includes("Kolkata")) tzAbbr = "IST";
        else if (serverTimezone === "UTC") tzAbbr = "UTC";
        else if (serverTimezone.includes("New_York")) tzAbbr = "EST";
        else if (serverTimezone.includes("London")) tzAbbr = "GMT";
        else if (serverTimezone.includes("Dubai")) tzAbbr = "GST";
        else tzAbbr = json.data.utcOffset || "TZ";

        tzBadge.textContent = tzAbbr;
        tzBadge.title = `Server Timezone: ${serverTimezone} (${json.data.utcOffset || "UTC"})`;
      }

      // Update pill tooltip
      const pill = document.getElementById("systemTimePill");
      if (pill) {
        const hostStatus = json.data.isHostUtc ? "Cloud Deployment (UTC Host)" : "Local Host Environment";
        pill.title = `System Time: ${json.data.formatted}\nTimezone: ${serverTimezone} (${json.data.utcOffset || "UTC"})\nHost: ${hostStatus}\nClick to view/change timezone`;
      }

      // Update automation system date if present
      const mSysDate = document.getElementById("metricAutoSystemToday");
      if (mSysDate && json.data.date) {
        mSysDate.textContent = json.data.date;
      }
    }
  } catch (err) {
    console.warn("Failed to sync system time:", err);
  }
}

function updateSystemClockDisplay() {
  const timeElem = document.getElementById("systemTimeText");
  if (!timeElem) return;

  const currentServerTime = new Date(Date.now() + serverTimeSkewMs);
  try {
    const timeFormatter = new Intl.DateTimeFormat("en-IN", {
      timeZone: serverTimezone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    });
    timeElem.textContent = timeFormatter.format(currentServerTime);
  } catch (e) {
    timeElem.textContent = currentServerTime.toLocaleTimeString();
  }
}

function initSystemTimeSync() {
  syncSystemTime();
  if (systemClockInterval) clearInterval(systemClockInterval);
  systemClockInterval = setInterval(updateSystemClockDisplay, 1000);
  setInterval(syncSystemTime, 30000);

  const pill = document.getElementById("systemTimePill");
  if (pill) {
    pill.style.cursor = "pointer";
    pill.addEventListener("click", () => {
      btnOpenSettings.click();
      const tzSelect = document.getElementById("settingAppTimezone");
      if (tzSelect) tzSelect.focus();
    });
  }
}

// =========================================================================
// CUSTOMER REPLIES & META WEBHOOK MANAGEMENT
// =========================================================================

let customerReplies = [];
let webhookConfig = null;
let repliesSearchDebounceTimer = null;

// Load Webhook Configuration (Callback URL, Verify Token, Stats)
async function loadWebhookConfig() {
  try {
    const res = await fetch("/api/webhook/config");
    const result = await res.json();
    if (!result.success) return;

    webhookConfig = result.data;

    // Update modal inputs
    const modalUrl = document.getElementById("modalWebhookUrl");
    const modalToken = document.getElementById("modalVerifyToken");
    const metricToken = document.getElementById("metricVerifyTokenDisplay");

    if (modalUrl) modalUrl.value = webhookConfig.webhookUrl;
    if (modalToken) modalToken.value = webhookConfig.verifyToken;
    if (metricToken) metricToken.textContent = webhookConfig.verifyToken || "Not Set";

    // Update live tunnel status bar in modal
    const dot = document.getElementById("tunnelStatusDot");
    const text = document.getElementById("tunnelStatusText");
    const badge = document.getElementById("tunnelProviderBadge");
    const bar = document.getElementById("tunnelStatusBar");

    if (webhookConfig.tunnelConnected) {
      if (dot) dot.style.background = "#10b981";
      if (text) {
        text.textContent = "Tunnel Connected & Active";
        text.style.color = "#10b981";
      }
      if (badge) badge.textContent = webhookConfig.tunnelType || "live";
      if (bar) {
        bar.style.background = "rgba(16, 185, 129, 0.1)";
        bar.style.borderColor = "rgba(16, 185, 129, 0.3)";
      }
    } else {
      if (dot) dot.style.background = "#f59e0b";
      if (text) {
        text.textContent = "Tunnel Initializing...";
        text.style.color = "#f59e0b";
      }
      if (badge) badge.textContent = "connecting";
      if (bar) {
        bar.style.background = "rgba(245, 158, 11, 0.1)";
        bar.style.borderColor = "rgba(245, 158, 11, 0.3)";
      }
    }

    // Update counts
    updateRepliesMetrics(webhookConfig.totalReplies, webhookConfig.unreadReplies, webhookConfig.distinctContacts);
  } catch (err) {
    console.warn("Could not load webhook config:", err.message);
  }
}

// Update replies stats chips and badge
function updateRepliesMetrics(total = 0, unread = 0, distinct = 0) {
  const elTotal = document.getElementById("metricTotalReplies");
  const elUnread = document.getElementById("metricUnreadReplies");
  const elDistinct = document.getElementById("metricDistinctContacts");
  const badge = document.getElementById("navRepliesBadge");

  if (elTotal) elTotal.textContent = String(total);
  if (elUnread) elUnread.textContent = String(unread);
  if (elDistinct) elDistinct.textContent = String(distinct);

  if (badge) {
    if (unread > 0) {
      badge.textContent = String(unread);
      badge.style.display = "inline-flex";
    } else {
      badge.style.display = "none";
    }
  }
}

// Load Customer Replies from Backend
async function loadCustomerReplies() {
  const container = document.getElementById("repliesStreamContainer");
  if (!container) return;

  const search = document.getElementById("repliesSearchInput")?.value || "";
  const filter = document.getElementById("repliesFilterStatus")?.value || "all";
  const unreadOnly = filter === "unread";

  try {
    const queryParams = new URLSearchParams();
    if (search.trim()) queryParams.set("search", search.trim());
    if (unreadOnly) queryParams.set("unreadOnly", "true");
    queryParams.set("limit", "100");

    const res = await fetch(`/api/replies?${queryParams.toString()}`);
    const result = await res.json();

    if (!result.success) {
      throw new Error(result.message || "Failed to load replies");
    }

    customerReplies = result.data || [];
    const pagination = result.pagination || {};

    updateRepliesMetrics(pagination.total, pagination.unreadCount, pagination.distinctContacts);
    renderRepliesList(customerReplies);
  } catch (err) {
    console.error("Error loading customer replies:", err);
    container.innerHTML = `
      <div style="text-align: center; color: var(--status-danger); padding: 2.5rem;">
        Failed to load replies: ${err.message}
      </div>
    `;
  }
}

// Render Replies List Cards
function renderRepliesList(replies) {
  const container = document.getElementById("repliesStreamContainer");
  if (!container) return;

  if (!replies || replies.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3.5rem 1.5rem; background: rgba(255,255,255,0.02); border: 1px dashed var(--border-glass); border-radius: var(--radius-md);">
        <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">💬</div>
        <h4 style="font-size: 1.05rem; color: #fff; margin-bottom: 0.4rem;">No Customer Replies Yet</h4>
        <p style="font-size: 0.82rem; color: var(--text-muted); max-width: 440px; margin: 0 auto 1.25rem;">
          When customers reply to your WhatsApp broadcasts or send messages, their incoming replies will automatically appear here in real time.
        </p>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('btnSimulateReply')?.click()">
          🧪 Simulate a Test Reply
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = "";

  replies.forEach(reply => {
    const card = document.createElement("div");
    card.className = `reply-card ${reply.is_read ? "" : "unread"}`;
    card.id = `reply-card-${reply.id}`;

    // Clean phone for wa.me link
    const cleanPhone = String(reply.from_phone || "").replace(/\D/g, "");
    const initials = (reply.customer_name || "Customer")
      .split(" ")
      .map(w => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

    // Format timestamp
    const dateObj = new Date(reply.received_at);
    const dateFormatted = !isNaN(dateObj.getTime())
      ? dateObj.toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        })
      : reply.received_at;

    // Type badge if not plain text
    let typeBadge = "";
    if (reply.message_type && reply.message_type !== "text") {
      typeBadge = `<span style="font-size: 0.68rem; text-transform: uppercase; background: rgba(6, 182, 212, 0.15); color: #38bdf8; border: 1px solid rgba(6, 182, 212, 0.3); border-radius: 4px; padding: 0.1rem 0.4rem;">${reply.message_type}</span>`;
    }

    // Campaign tag if matched
    let campaignTag = "";
    if (reply.campaign_name) {
      campaignTag = `<span class="reply-campaign-badge" title="Associated Broadcast Campaign">🏷 ${escapeHtml(reply.campaign_name)}</span>`;
    }

    // Outbound reply bubble if already replied
    let replyBoxHtml = "";
    if (reply.reply_text) {
      const isAuto = reply.reply_status === "AUTO_REPLIED";
      const replyTime = reply.reply_sent_at ? new Date(reply.reply_sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";
      replyBoxHtml = `
        <div class="outbound-reply-box">
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem;">
            <span style="font-weight: 600; color: #25d366; display: flex; align-items: center; gap: 0.35rem;">
              <span>✓</span> ${isAuto ? '🤖 Automated Auto-Reply' : '💬 Business Reply Sent'}
            </span>
            <span style="color: var(--text-muted); font-size: 0.68rem;">${replyTime}</span>
          </div>
          <div style="font-size: 0.83rem; color: #fff; line-height: 1.4; word-break: break-word;">
            ${escapeHtml(reply.reply_text)}
          </div>
        </div>
      `;
    }

    // Inline 2-way reply drawer
    const inlineReplyDrawer = `
      <div id="reply-drawer-${reply.id}" class="inline-reply-drawer" style="display: none;">
        <div style="display: flex; gap: 0.35rem; margin-bottom: 0.5rem; flex-wrap: wrap;">
          <span class="quick-reply-pill" onclick="insertQuickReply(${reply.id}, 'Thank you for reaching out! Our team is processing your request.')">Thanks / Processing</span>
          <span class="quick-reply-pill" onclick="insertQuickReply(${reply.id}, 'Hi! Could you please share more details so we can assist you?')">Need Details</span>
          <span class="quick-reply-pill" onclick="insertQuickReply(${reply.id}, 'Here is the link to register as a partner: https://konkantrip.com/partner')">Partner Link</span>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <input type="text" id="input-reply-${reply.id}" class="form-input" placeholder="Type reply message to +${cleanPhone}..." style="font-size: 0.82rem;" onkeydown="if(event.key==='Enter') sendCustomerReply(${reply.id})">
          <button class="btn btn-primary btn-sm" id="btn-send-reply-${reply.id}" onclick="sendCustomerReply(${reply.id})" style="white-space: nowrap; padding: 0.35rem 0.85rem;">
            Send ➔
          </button>
        </div>
      </div>
    `;

    card.innerHTML = `
      <div class="reply-avatar">${initials}</div>
      <div class="reply-main">
        <div class="reply-header-row">
          <span class="reply-customer-name">${escapeHtml(reply.customer_name || "Customer")}</span>
          <span class="reply-phone">+${reply.from_phone}</span>
          ${campaignTag}
          ${typeBadge}
        </div>
        <div class="reply-bubble">${escapeHtml(reply.message_body || "")}</div>
        ${replyBoxHtml}
        <div class="reply-footer-row">
          <span class="reply-timestamp">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 14 14"></polyline>
            </svg>
            ${dateFormatted}
            ${reply.is_read ? '<span style="color:#64748b; margin-left:6px;">• Read</span>' : '<span style="color:#3b82f6; font-weight:600; margin-left:6px;">• New</span>'}
          </span>
          <div class="reply-actions-row">
            <button class="btn btn-primary btn-sm" onclick="toggleReplyBox(${reply.id})" style="padding: 0.25rem 0.65rem; font-size: 0.72rem;">
              💬 Reply
            </button>
            <a href="https://wa.me/${cleanPhone}" target="_blank" class="btn-whatsapp-chat" title="Open direct WhatsApp chat with this customer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm.01 1.67c2.2 0 4.26.86 5.82 2.42a8.204 8.204 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.24 8.24-1.42 0-2.82-.37-4.06-1.07l-.29-.17-3.02.79.81-2.94-.19-.3a8.196 8.196 0 0 1-1.25-4.37c0-4.54 3.7-8.24 8.24-8.24zm4.78 11.66c-.2-.1-.1.19-.38-.05-.28-.24-1.63-.8-1.88-.9-.25-.09-.43-.14-.61.14-.18.28-.71.9-.87 1.08-.16.19-.32.21-.6.07-.28-.14-1.18-.44-2.25-1.39-.83-.74-1.39-1.66-1.55-1.94-.16-.28-.02-.43.12-.57.13-.13.28-.32.42-.48.14-.16.19-.28.28-.46.09-.19.05-.35-.02-.49-.07-.14-.61-1.47-.84-2.02-.22-.53-.45-.46-.61-.47h-.52c-.18 0-.48.07-.73.35-.25.28-.96.94-.96 2.3s.98 2.67 1.12 2.86c.14.19 1.93 2.95 4.68 4.14.65.28 1.16.45 1.56.58.66.21 1.26.18 1.73.11.53-.08 1.63-.67 1.86-1.31.23-.65.23-1.2.16-1.31-.07-.12-.25-.19-.53-.29z"/>
              </svg>
              Chat on WhatsApp
            </a>
            ${
              !reply.is_read
                ? `<button class="btn btn-secondary btn-sm" onclick="markReplyRead(${reply.id})" style="padding: 0.25rem 0.6rem; font-size: 0.72rem;">✓ Mark Read</button>`
                : ""
            }
            <button class="btn btn-secondary btn-sm" onclick="deleteCustomerReply(${reply.id})" style="padding: 0.25rem 0.5rem; font-size: 0.72rem; color: #ef4444;" title="Delete reply">✕</button>
          </div>
        </div>
        ${inlineReplyDrawer}
      </div>
    `;

    container.appendChild(card);
  });
}

// Mark single reply read
window.markReplyRead = async function(id) {
  try {
    const res = await fetch(`/api/replies/${id}/mark-read`, { method: "POST" });
    const data = await res.json();
    if (data.success) {
      const card = document.getElementById(`reply-card-${id}`);
      if (card) {
        card.classList.remove("unread");
      }
      loadCustomerReplies();
    }
  } catch (err) {
    showToast(err.message, "error");
  }
};

// Delete single reply
window.deleteCustomerReply = async function(id) {
  if (!confirm("Are you sure you want to delete this reply record?")) return;
  try {
    const res = await fetch(`/api/replies/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      showToast("Reply deleted.", "success");
      loadCustomerReplies();
    }
  } catch (err) {
    showToast(err.message, "error");
  }
};

// Mark all as read
async function markAllRepliesRead() {
  try {
    const res = await fetch("/api/replies/mark-all-read", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      showToast("All replies marked as read.", "success");
      loadCustomerReplies();
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

// Handle real-time incoming reply via SSE
function handleIncomingReplySSE(reply) {
  if (!reply) return;
  showToast(`💬 New WhatsApp reply from ${reply.customer_name || reply.from_phone}: "${reply.message_body || ''}"`, "success");
  loadCustomerReplies();
}

// Utility HTML escape
function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Webhook Modal bindings
const btnHeaderWebhook = document.getElementById("btnHeaderWebhook");
const btnOpenWebhookModal = document.getElementById("btnOpenWebhookModal");
const webhookModal = document.getElementById("webhookModal");
const btnCloseWebhookModal = document.getElementById("btnCloseWebhookModal");
const btnCloseWebhookModalBtn = document.getElementById("btnCloseWebhookModalBtn");

function openWebhookModal() {
  if (webhookModal) {
    webhookModal.classList.add("active");
    webhookModal.style.display = "flex";
    loadWebhookConfig();
  }
}

function closeWebhookModal() {
  if (webhookModal) {
    webhookModal.classList.remove("active");
    webhookModal.style.display = "none";
  }
}

if (btnHeaderWebhook) btnHeaderWebhook.addEventListener("click", openWebhookModal);
if (btnOpenWebhookModal) btnOpenWebhookModal.addEventListener("click", openWebhookModal);
if (btnCloseWebhookModal) btnCloseWebhookModal.addEventListener("click", closeWebhookModal);
if (btnCloseWebhookModalBtn) btnCloseWebhookModalBtn.addEventListener("click", closeWebhookModal);

// Copy Webhook URL
document.getElementById("btnCopyWebhookUrl")?.addEventListener("click", () => {
  const urlInput = document.getElementById("modalWebhookUrl");
  if (urlInput) {
    navigator.clipboard.writeText(urlInput.value).then(() => {
      showToast("Webhook URL copied to clipboard!", "success");
    }).catch(() => {
      urlInput.select();
      document.execCommand("copy");
      showToast("Webhook URL copied!", "success");
    });
  }
});

// Copy Verify Token
document.getElementById("btnCopyVerifyToken")?.addEventListener("click", () => {
  const tokenInput = document.getElementById("modalVerifyToken");
  if (tokenInput) {
    navigator.clipboard.writeText(tokenInput.value).then(() => {
      showToast("Verify Token copied to clipboard!", "success");
    }).catch(() => {
      tokenInput.select();
      document.execCommand("copy");
      showToast("Verify Token copied!", "success");
    });
  }
});

// Generate New Verify Token
document.getElementById("btnGenerateNewVerifyToken")?.addEventListener("click", async () => {
  const btn = document.getElementById("btnGenerateNewVerifyToken");
  if (btn) btn.disabled = true;
  try {
    const res = await fetch("/api/webhook/generate-token", { method: "POST" });
    const result = await res.json();
    if (result.success) {
      document.getElementById("modalVerifyToken").value = result.data.verifyToken;
      const metric = document.getElementById("metricVerifyTokenDisplay");
      if (metric) metric.textContent = result.data.verifyToken;
      showToast("New Webhook Verify Token generated!", "success");
    } else {
      throw new Error(result.message);
    }
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
});

// Save Custom Token
document.getElementById("btnSaveCustomToken")?.addEventListener("click", async () => {
  const token = document.getElementById("modalVerifyToken")?.value?.trim();
  if (!token) {
    showToast("Please enter a verify token.", "error");
    return;
  }
  try {
    const res = await fetch("/api/webhook/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verifyToken: token })
    });
    const result = await res.json();
    if (result.success) {
      showToast("Verify token saved successfully!", "success");
      const metric = document.getElementById("metricVerifyTokenDisplay");
      if (metric) metric.textContent = token;
    } else {
      throw new Error(result.message);
    }
  } catch (err) {
    showToast(err.message, "error");
  }
});

// Test Webhook Handshake with Meta
document.getElementById("btnTestWebhookHandshake")?.addEventListener("click", async () => {
  const btn = document.getElementById("btnTestWebhookHandshake");
  const resultBox = document.getElementById("handshakeResultBox");
  if (btn) btn.disabled = true;
  if (resultBox) {
    resultBox.style.display = "block";
    resultBox.style.background = "rgba(59, 130, 246, 0.1)";
    resultBox.style.border = "1px solid rgba(59, 130, 246, 0.3)";
    resultBox.style.color = "#60a5fa";
    resultBox.innerHTML = "⏳ Sending handshake request to tunnel endpoint...";
  }

  try {
    const res = await fetch("/api/webhook/test-handshake");
    const result = await res.json();
    if (result.success) {
      resultBox.style.background = "rgba(16, 185, 129, 0.12)";
      resultBox.style.border = "1px solid rgba(16, 185, 129, 0.35)";
      resultBox.style.color = "#34d399";
      resultBox.innerHTML = `✅ <strong>Meta Handshake Verified!</strong> Returned HTTP 200 with challenge: <code>${escapeHtml(result.data.challengeResponse)}</code>`;
      showToast("Webhook handshake verified successfully!", "success");
    } else {
      resultBox.style.background = "rgba(239, 68, 68, 0.12)";
      resultBox.style.border = "1px solid rgba(239, 68, 68, 0.35)";
      resultBox.style.color = "#f87171";
      resultBox.innerHTML = `❌ <strong>Verification failed:</strong> ${escapeHtml(result.message)}`;
      showToast("Handshake verification failed", "error");
    }
  } catch (err) {
    if (resultBox) {
      resultBox.style.background = "rgba(239, 68, 68, 0.12)";
      resultBox.style.border = "1px solid rgba(239, 68, 68, 0.35)";
      resultBox.style.color = "#f87171";
      resultBox.innerHTML = `❌ <strong>Error:</strong> ${escapeHtml(err.message)}`;
    }
    showToast(err.message, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
});

// Restart Tunnel
document.getElementById("btnRestartTunnel")?.addEventListener("click", async () => {
  const btn = document.getElementById("btnRestartTunnel");
  if (btn) btn.disabled = true;
  showToast("Restarting tunnel...", "info");
  try {
    const res = await fetch("/api/webhook/tunnel/restart", { method: "POST" });
    const result = await res.json();
    if (result.success) {
      showToast("Tunnel reconnected!", "success");
      await loadWebhookConfig();
    } else {
      throw new Error(result.message);
    }
  } catch (err) {
    showToast(`Tunnel restart error: ${err.message}`, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
});

// Simulate Reply Modal
const btnSimulateReply = document.getElementById("btnSimulateReply");
const simulateReplyModal = document.getElementById("simulateReplyModal");
const btnCloseSimulateModal = document.getElementById("btnCloseSimulateModal");
const btnCancelSimulate = document.getElementById("btnCancelSimulate");
const btnSendSimulatedReply = document.getElementById("btnSendSimulatedReply");

function openSimulateModal() {
  if (simulateReplyModal) {
    simulateReplyModal.classList.add("active");
    simulateReplyModal.style.display = "flex";
  }
}

function closeSimulateModal() {
  if (simulateReplyModal) {
    simulateReplyModal.classList.remove("active");
    simulateReplyModal.style.display = "none";
  }
}

if (btnSimulateReply) btnSimulateReply.addEventListener("click", openSimulateModal);
if (btnCloseSimulateModal) btnCloseSimulateModal.addEventListener("click", closeSimulateModal);
if (btnCancelSimulate) btnCancelSimulate.addEventListener("click", closeSimulateModal);

if (btnSendSimulatedReply) {
  btnSendSimulatedReply.addEventListener("click", async () => {
    const phone = document.getElementById("simFromPhone")?.value?.trim() || "919876543210";
    const name = document.getElementById("simCustomerName")?.value?.trim() || "Customer";
    const body = document.getElementById("simMessageBody")?.value?.trim() || "Yes, interested!";

    btnSendSimulatedReply.disabled = true;
    try {
      const res = await fetch("/api/webhook/test-simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromPhone: phone, customerName: name, messageBody: body })
      });
      const result = await res.json();
      if (result.success) {
        showToast("Simulated reply received!", "success");
        closeSimulateModal();
        loadCustomerReplies();
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btnSendSimulatedReply.disabled = false;
    }
  });
}

// Mark All Read & Refresh Buttons
document.getElementById("btnMarkAllRead")?.addEventListener("click", markAllRepliesRead);
document.getElementById("btnRefreshReplies")?.addEventListener("click", () => {
  loadCustomerReplies();
  showToast("Customer replies refreshed.", "success");
});

// Search & Filter listeners
document.getElementById("repliesSearchInput")?.addEventListener("input", () => {
  clearTimeout(repliesSearchDebounceTimer);
  repliesSearchDebounceTimer = setTimeout(() => {
    loadCustomerReplies();
  }, 300);
});

document.getElementById("repliesFilterStatus")?.addEventListener("change", () => {
  loadCustomerReplies();
});

// Customer Reply & Auto-Reply Handlers
window.toggleReplyBox = function(id) {
  const drawer = document.getElementById(`reply-drawer-${id}`);
  if (!drawer) return;
  const isHidden = drawer.style.display === "none" || !drawer.style.display;
  drawer.style.display = isHidden ? "block" : "none";
  if (isHidden) {
    const input = document.getElementById(`input-reply-${id}`);
    if (input) input.focus();
  }
};

window.insertQuickReply = function(id, text) {
  const input = document.getElementById(`input-reply-${id}`);
  if (input) {
    input.value = text;
    input.focus();
  }
};

window.sendCustomerReply = async function(id) {
  const input = document.getElementById(`input-reply-${id}`);
  const btn = document.getElementById(`btn-send-reply-${id}`);
  const text = (input?.value || "").trim();

  if (!text) {
    showToast("Please enter a reply message.", "error");
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Sending...";
  }

  try {
    const res = await fetch(`/api/replies/${encodeURIComponent(id)}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replyText: text })
    });
    const result = await res.json();
    if (result.success) {
      showToast("Reply delivered via WhatsApp!", "success");
      if (input) input.value = "";
      const drawer = document.getElementById(`reply-drawer-${id}`);
      if (drawer) drawer.style.display = "none";
      await loadCustomerReplies();
    } else {
      throw new Error(result.message || "Failed to send reply");
    }
  } catch (err) {
    showToast(`Reply error: ${err.message}`, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Send ➔";
    }
  }
};

// Auto-Reply Settings & Modal Management
async function loadAutoReplySettings() {
  try {
    const res = await fetch("/api/replies/auto-reply-settings");
    const json = await res.json();
    if (json.success && json.data) {
      const { enabled, message } = json.data;
      const badge = document.getElementById("badgeAutoReplyStatus");
      const preview = document.getElementById("textAutoReplyPreview");
      const chk = document.getElementById("chkAutoReplyEnabled");
      const txt = document.getElementById("txtAutoReplyMessage");

      if (badge) {
        badge.textContent = enabled ? "Active" : "Disabled";
        badge.style.background = enabled ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)";
        badge.style.color = enabled ? "#34d399" : "#f87171";
      }

      if (preview) {
        preview.textContent = enabled
          ? `Template: "${message}"`
          : "Automated instant replies are currently disabled.";
      }

      if (chk) chk.checked = !!enabled;
      if (txt && message) txt.value = message;
    }
  } catch (err) {
    console.warn("Failed to load auto-reply settings:", err.message);
  }
}

const btnOpenAutoReplyModal = document.getElementById("btnOpenAutoReplyModal");
const autoReplyModal = document.getElementById("autoReplyModal");
const btnCloseAutoReplyModal = document.getElementById("btnCloseAutoReplyModal");
const btnCancelAutoReplyModal = document.getElementById("btnCancelAutoReplyModal");
const btnSaveAutoReplySettings = document.getElementById("btnSaveAutoReplySettings");

function openAutoReplyModal() {
  if (autoReplyModal) {
    autoReplyModal.classList.add("active");
    autoReplyModal.style.display = "flex";
  }
}

function closeAutoReplyModal() {
  if (autoReplyModal) {
    autoReplyModal.classList.remove("active");
    autoReplyModal.style.display = "none";
  }
}

if (btnOpenAutoReplyModal) btnOpenAutoReplyModal.addEventListener("click", openAutoReplyModal);
if (btnCloseAutoReplyModal) btnCloseAutoReplyModal.addEventListener("click", closeAutoReplyModal);
if (btnCancelAutoReplyModal) btnCancelAutoReplyModal.addEventListener("click", closeAutoReplyModal);

if (btnSaveAutoReplySettings) {
  btnSaveAutoReplySettings.addEventListener("click", async () => {
    const enabled = document.getElementById("chkAutoReplyEnabled")?.checked ?? true;
    const message = document.getElementById("txtAutoReplyMessage")?.value?.trim() || "";

    btnSaveAutoReplySettings.disabled = true;
    btnSaveAutoReplySettings.textContent = "Saving...";

    try {
      const res = await fetch("/api/replies/auto-reply-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, message })
      });
      const data = await res.json();
      if (data.success) {
        showToast("Auto-reply settings saved successfully!", "success");
        closeAutoReplyModal();
        await loadAutoReplySettings();
      } else {
        throw new Error(data.message || "Failed to save settings");
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btnSaveAutoReplySettings.disabled = false;
      btnSaveAutoReplySettings.textContent = "Save Auto-Reply Settings";
    }
  });
}

// =========================================================================
// GOOGLE SHEETS BOOKING AUTOMATION LOGIC
// =========================================================================

const btnPreviewSheet = document.getElementById("btnPreviewSheet");
const btnRunAutomationNow = document.getElementById("btnRunAutomationNow");
const btnSaveAutomationConfig = document.getElementById("btnSaveAutomationConfig");
const btnPasteSheetUrl = document.getElementById("btnPasteSheetUrl");
const btnRefreshAutoHistory = document.getElementById("btnRefreshAutoHistory");
const autoSheetUrlInput = document.getElementById("autoSheetUrl");
const autoPropertyNameInput = document.getElementById("autoPropertyName");
const autoEnabledToggle = document.getElementById("autoEnabledToggle");
const autoEnabledLabel = document.getElementById("autoEnabledLabel");

if (autoEnabledToggle && autoEnabledLabel) {
  autoEnabledToggle.addEventListener("change", () => {
    autoEnabledLabel.textContent = autoEnabledToggle.checked ? "Active (Every 1 min scan)" : "Paused (Manual Only)";
  });
}

if (btnPasteSheetUrl && autoSheetUrlInput) {
  btnPasteSheetUrl.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.includes("docs.google.com")) {
        autoSheetUrlInput.value = text.trim();
        showToast("Google Sheet URL pasted from clipboard!", "info");
        inspectGoogleSheet(true);
      } else if (text) {
        autoSheetUrlInput.value = text.trim();
        showToast("Pasted clipboard text.", "info");
      }
    } catch (e) {
      showToast("Clipboard permission required. Please paste manually into the input box.", "warning");
    }
  });
}

function getActiveStagesFromUI() {
  return {
    beforeCheckin: {
      id: "beforeCheckin",
      title: "Before Check-in (Route & Directions)",
      triggerType: "BEFORE_CHECKIN",
      enabled: Boolean(document.getElementById("autoStageBeforeCheckinEnabled")?.checked),
      offsetDays: parseInt(document.getElementById("autoStageBeforeCheckinOffset")?.value || "1", 10),
      dispatchTime: document.getElementById("autoStageBeforeCheckinTime")?.value || "10:00",
      templateName: document.getElementById("autoStageBeforeCheckinTemplate")?.value || currentAutomationConfig.stages?.beforeCheckin?.templateName || "kt_best_route_to_property",
      badgeLabel: "🚗 Pre-Arrival",
      color: "#25d366"
    },
    onCheckin: {
      id: "onCheckin",
      title: "On Check-in Day (Welcome & Wi-Fi)",
      triggerType: "ON_CHECKIN",
      enabled: Boolean(document.getElementById("autoStageOnCheckinEnabled")?.checked),
      offsetDays: 0,
      dispatchTime: document.getElementById("autoStageOnCheckinTime")?.value || "12:00",
      templateName: document.getElementById("autoStageOnCheckinTemplate")?.value || currentAutomationConfig.stages?.onCheckin?.templateName || "kt_invitation_",
      badgeLabel: "🏨 Welcome",
      color: "#a78bfa"
    },
    onCheckout: {
      id: "onCheckout",
      title: "On Check-out Day (Departure & Luggage)",
      triggerType: "ON_CHECKOUT",
      enabled: Boolean(document.getElementById("autoStageOnCheckoutEnabled")?.checked),
      offsetDays: 0,
      dispatchTime: document.getElementById("autoStageOnCheckoutTime")?.value || "09:00",
      templateName: document.getElementById("autoStageOnCheckoutTemplate")?.value || currentAutomationConfig.stages?.onCheckout?.templateName || "kt_checkout_belongings_reminder",
      badgeLabel: "🧳 Departure",
      color: "#60a5fa"
    },
    afterCheckout: {
      id: "afterCheckout",
      title: "After Check-out (Review & Thank You)",
      triggerType: "AFTER_CHECKOUT",
      enabled: Boolean(document.getElementById("autoStageAfterCheckoutEnabled")?.checked),
      offsetDays: parseInt(document.getElementById("autoStageAfterCheckoutOffset")?.value || "1", 10),
      dispatchTime: document.getElementById("autoStageAfterCheckoutTime")?.value || "18:00",
      templateName: document.getElementById("autoStageAfterCheckoutTemplate")?.value || currentAutomationConfig.stages?.afterCheckout?.templateName || "kt_restaurant_invitation",
      badgeLabel: "⭐ Feedback",
      color: "#f59e0b"
    }
  };
}

function renderStageStatusBadge(stageData) {
  if (!stageData) {
    return `<span class="status-badge" style="background: rgba(255,255,255,0.03); color: var(--text-subtle);">—</span>`;
  }
  const { status, templateName, dispatchTime, targetDate } = stageData;

  if (status === "DUE_FOR_SEND") {
    const tplLabel = templateName ? `: ${escapeHtml(templateName)}` : "";
    return `<span class="status-badge" style="background: rgba(37,211,102,0.18); color: #25d366; border: 1px solid rgba(37,211,102,0.4); font-weight: 600;" title="Due right now (${dispatchTime || ''})">🚀 Due${tplLabel}</span>`;
  }
  if (status === "SCHEDULED_FOR_TODAY") {
    return `<span class="status-badge" style="background: rgba(56,189,248,0.18); color: #38bdf8; border: 1px solid rgba(56,189,248,0.35); font-weight: 500;" title="Scheduled today at ${dispatchTime}">⏰ Today ${dispatchTime}</span>`;
  }
  if (status === "ALREADY_SENT") {
    return `<span class="status-badge" style="background: rgba(16,185,129,0.12); color: #34d399;">✓ Sent</span>`;
  }
  if (status === "FUTURE_UPCOMING") {
    const dateLabel = targetDate ? ` (${targetDate.slice(5)})` : "";
    return `<span class="status-badge" style="background: rgba(255,255,255,0.05); color: var(--text-muted);" title="Target date: ${targetDate || ''}">Upcoming${dateLabel}</span>`;
  }
  if (status === "PAST" || status === "PAST_CHECKIN" || status === "PAST_CHECKOUT") {
    return `<span class="status-badge" style="background: rgba(255,255,255,0.03); color: var(--text-subtle);">Past</span>`;
  }
  if (status === "DISABLED") {
    return `<span class="status-badge" style="background: rgba(255,255,255,0.02); color: var(--text-subtle); opacity: 0.6;">Disabled</span>`;
  }
  if (status === "MISSING_DATE") {
    return `<span class="status-badge" style="color: var(--status-danger);">No Date</span>`;
  }
  return `<span class="status-badge" style="background: rgba(255,255,255,0.03); color: var(--text-subtle);">${escapeHtml(status || '—')}</span>`;
}

async function loadAutomationDashboard() {
  try {
    const res = await fetch("/api/automation/config");
    const json = await res.json();
    if (json.success && json.data) {
      const c = json.data;
      if (autoSheetUrlInput) autoSheetUrlInput.value = c.googleSheetUrl || "";
      if (autoPropertyNameInput) autoPropertyNameInput.value = c.defaultPropertyName || "KonkanTrip Beach Resort";

      if (autoEnabledToggle) {
        autoEnabledToggle.checked = Boolean(c.enabled);
        if (autoEnabledLabel) {
          autoEnabledLabel.textContent = c.enabled ? "Active (Every 1 min scan)" : "Paused (Manual Only)";
        }
      }

      const metricLastSync = document.getElementById("metricAutoLastSync");
      if (metricLastSync && c.lastSyncAt) {
        metricLastSync.textContent = new Date(c.lastSyncAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }

      // Populate 4 stages configuration
      if (c.stages) {
        currentAutomationConfig.stages = c.stages;

        // Stage 1: Before Check-in
        const s1 = c.stages.beforeCheckin;
        if (s1) {
          const elEn = document.getElementById("autoStageBeforeCheckinEnabled");
          const elOff = document.getElementById("autoStageBeforeCheckinOffset");
          const elTime = document.getElementById("autoStageBeforeCheckinTime");
          if (elEn) elEn.checked = Boolean(s1.enabled);
          if (elOff && s1.offsetDays !== undefined) elOff.value = String(s1.offsetDays);
          if (elTime && s1.dispatchTime) elTime.value = s1.dispatchTime;
        }

        // Stage 2: On Check-in Day
        const s2 = c.stages.onCheckin;
        if (s2) {
          const elEn = document.getElementById("autoStageOnCheckinEnabled");
          const elTime = document.getElementById("autoStageOnCheckinTime");
          if (elEn) elEn.checked = Boolean(s2.enabled);
          if (elTime && s2.dispatchTime) elTime.value = s2.dispatchTime;
        }

        // Stage 3: On Check-out Day
        const s3 = c.stages.onCheckout;
        if (s3) {
          const elEn = document.getElementById("autoStageOnCheckoutEnabled");
          const elTime = document.getElementById("autoStageOnCheckoutTime");
          if (elEn) elEn.checked = Boolean(s3.enabled);
          if (elTime && s3.dispatchTime) elTime.value = s3.dispatchTime;
        }

        // Stage 4: After Check-out Day
        const s4 = c.stages.afterCheckout;
        if (s4) {
          const elEn = document.getElementById("autoStageAfterCheckoutEnabled");
          const elOff = document.getElementById("autoStageAfterCheckoutOffset");
          const elTime = document.getElementById("autoStageAfterCheckoutTime");
          if (elEn) elEn.checked = Boolean(s4.enabled);
          if (elOff && s4.offsetDays !== undefined) elOff.value = String(s4.offsetDays);
          if (elTime && s4.dispatchTime) elTime.value = s4.dispatchTime;
        }
      }

      renderAutomationTemplateDropdowns();

      // If sheet URL is already set, inspect sheet to show live preview table
      if (c.googleSheetUrl) {
        inspectGoogleSheet(false);
      }
    }

    loadAutomationHistory();
  } catch (err) {
    console.warn("Failed to load automation config:", err);
  }
}

// Stage dropdown and input change listeners
[
  "autoStageBeforeCheckinTemplate",
  "autoStageOnCheckinTemplate",
  "autoStageOnCheckoutTemplate",
  "autoStageAfterCheckoutTemplate",
  "autoStageBeforeCheckinOffset",
  "autoStageAfterCheckoutOffset",
  "autoStageBeforeCheckinTime",
  "autoStageOnCheckinTime",
  "autoStageOnCheckoutTime",
  "autoStageAfterCheckoutTime",
  "autoStageBeforeCheckinEnabled",
  "autoStageOnCheckinEnabled",
  "autoStageOnCheckoutEnabled",
  "autoStageAfterCheckoutEnabled"
].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener("change", () => {
      updateAutomationTemplateHints();
      if (autoSheetUrlInput?.value?.trim()) {
        inspectGoogleSheet(false);
      }
    });
  }
});

const btnAutoOpenAddTemplateModal = document.getElementById("btnAutoOpenAddTemplateModal");
if (btnAutoOpenAddTemplateModal) {
  btnAutoOpenAddTemplateModal.addEventListener("click", () => {
    btnOpenAddTemplateModal.click();
  });
}

async function saveAutomationConfig() {
  if (!btnSaveAutomationConfig) return;
  const sheetUrl = autoSheetUrlInput?.value?.trim() || "";
  const defaultPropertyName = autoPropertyNameInput?.value?.trim() || "KonkanTrip Beach Resort";
  const enabled = Boolean(autoEnabledToggle?.checked);
  const stages = getActiveStagesFromUI();

  btnSaveAutomationConfig.disabled = true;
  btnSaveAutomationConfig.textContent = "Saving...";

  try {
    const res = await fetch("/api/automation/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        googleSheetUrl: sheetUrl,
        defaultPropertyName,
        enabled,
        stages,
        preCheckinOffsetDays: stages.beforeCheckin.offsetDays,
        preCheckinTemplate: stages.beforeCheckin.templateName,
        checkoutTemplate: stages.onCheckout.templateName
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast("Booking lifecycle automation settings saved!", "success");
      if (sheetUrl) {
        inspectGoogleSheet(false);
      }
    } else {
      throw new Error(data.message || "Failed to save settings");
    }
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btnSaveAutomationConfig.disabled = false;
    btnSaveAutomationConfig.textContent = "💾 Save Settings";
  }
}

if (btnSaveAutomationConfig) {
  btnSaveAutomationConfig.addEventListener("click", saveAutomationConfig);
}

async function inspectGoogleSheet(userInitiated = false) {
  const sheetUrl = autoSheetUrlInput?.value?.trim();
  if (!sheetUrl) {
    if (userInitiated) {
      showToast("Please enter or paste your Google Sheet URL first.", "warning");
      autoSheetUrlInput?.focus();
    }
    return;
  }

  const tableBody = document.getElementById("autoBookingsTableBody");
  if (tableBody) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; color: var(--accent-wa); padding: 2.5rem;">
          <div style="display: flex; align-items: center; justify-content: center; gap: 0.75rem;">
            <div class="pulse-dot" style="display: inline-block;"></div>
            <span>Fetching live Google Sheet data &amp; evaluating 4-stage triggers...</span>
          </div>
        </td>
      </tr>
    `;
  }

  if (btnPreviewSheet) {
    btnPreviewSheet.disabled = true;
    btnPreviewSheet.textContent = "Inspecting...";
  }

  try {
    const currentStages = getActiveStagesFromUI();
    const res = await fetch("/api/automation/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sheetUrl,
        stages: currentStages,
        preCheckinTemplate: currentStages.beforeCheckin.templateName,
        checkoutTemplate: currentStages.onCheckout.templateName
      })
    });
    const json = await res.json();

    if (!json.success || !json.data) {
      throw new Error(json.message || "Could not inspect sheet");
    }

    const d = json.data;

    // Update metrics
    const mTotal = document.getElementById("metricAutoTotal");
    const mPre = document.getElementById("metricAutoPreCheckinDue");
    const mOnIn = document.getElementById("metricAutoOnCheckinDue");
    const mOut = document.getElementById("metricAutoCheckoutDue");
    const mAfterOut = document.getElementById("metricAutoAfterCheckoutDue");
    const mSched = document.getElementById("metricAutoScheduledToday");
    const mBadge = document.getElementById("navAutomationBadge");

    if (mTotal) mTotal.textContent = d.validBookingsCount ?? d.totalRows ?? 0;
    if (mPre) mPre.textContent = d.dueBeforeCheckinCount ?? d.duePreCheckinCount ?? 0;
    if (mOnIn) mOnIn.textContent = d.dueOnCheckinCount ?? 0;
    if (mOut) mOut.textContent = d.dueOnCheckoutCount ?? d.dueCheckoutCount ?? 0;
    if (mAfterOut) mAfterOut.textContent = d.dueAfterCheckoutCount ?? 0;
    if (mSched) mSched.textContent = d.scheduledTodayCount ?? 0;

    const mSysDate = document.getElementById("metricAutoSystemToday");
    if (mSysDate && d.todayDate) {
      mSysDate.textContent = d.todayDate;
    }

    const mSysTime = document.getElementById("metricAutoSystemTime");
    if (mSysTime && d.systemTime) {
      mSysTime.textContent = d.systemTime;
    }

    const totalDue = (d.dueBeforeCheckinCount || 0) + (d.dueOnCheckinCount || 0) + (d.dueOnCheckoutCount || 0) + (d.dueAfterCheckoutCount || 0);
    if (mBadge) {
      if (totalDue > 0) {
        mBadge.textContent = totalDue;
        mBadge.style.display = "inline-block";
      } else {
        mBadge.style.display = "none";
      }
    }

    // Update detected columns banner
    const colSummary = document.getElementById("autoDetectedColumnsSummary");
    if (colSummary && d.detectedColumns) {
      const cols = d.detectedColumns;
      colSummary.innerHTML = `
        Detected: <strong>Name</strong> (${cols.nameCol || "—"}) &bull; 
        <strong>Phone</strong> (${cols.phoneCol || "—"}) &bull; 
        <strong>Check-in</strong> (${cols.checkinCol || "—"}) &bull; 
        <strong>Check-out</strong> (${cols.checkoutCol || "—"})
      `;
    }

    // Render bookings table
    if (tableBody) {
      if (!d.bookings || d.bookings.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="10" style="text-align: center; color: var(--text-muted); padding: 2rem;">
              No bookings found in the spreadsheet.
            </td>
          </tr>
        `;
        return;
      }

      tableBody.innerHTML = d.bookings.map((b, idx) => {
        const phoneDisplay = b.cleanPhone ? `+${b.cleanPhone}` : (b.rawPhone || "<span style='color:var(--status-danger)'>Missing</span>");

        const stageBefore = b.stages?.beforeCheckin || { status: b.preCheckinStatus, templateName: b.preCheckinTemplate };
        const stageOnCheckin = b.stages?.onCheckin;
        const stageOnCheckout = b.stages?.onCheckout || { status: b.checkoutStatus, templateName: b.checkoutTemplate };
        const stageAfter = b.stages?.afterCheckout;

        return `
          <tr style="${b.isDueNow ? 'background: rgba(37,211,102,0.04);' : ''}">
            <td style="color: var(--text-subtle);">${idx + 1}</td>
            <td style="font-weight: 600; color: #fff;">${escapeHtml(b.guestName || "Guest")}</td>
            <td style="font-family: monospace; font-size: 0.84rem;">${phoneDisplay}</td>
            <td style="font-family: monospace;">${b.checkinDate || '<span style="color:var(--text-subtle)">—</span>'}</td>
            <td style="font-family: monospace;">${b.checkoutDate || '<span style="color:var(--text-subtle)">—</span>'}</td>
            <td style="font-size: 0.82rem; color: var(--text-muted);">${escapeHtml(b.propertyName || "—")}</td>
            <td>${renderStageStatusBadge(stageBefore)}</td>
            <td>${renderStageStatusBadge(stageOnCheckin)}</td>
            <td>${renderStageStatusBadge(stageOnCheckout)}</td>
            <td>${renderStageStatusBadge(stageAfter)}</td>
          </tr>
        `;
      }).join("");
    }

    if (userInitiated) {
      showToast(`Sheet inspected: ${d.bookings.length} guests parsed, ${totalDue} due right now, ${d.scheduledTodayCount || 0} scheduled later today!`, "success");
    }
  } catch (err) {
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; color: var(--status-danger); padding: 2rem;">
            Failed to inspect Google Sheet: ${escapeHtml(err.message)}
          </td>
        </tr>
      `;
    }
    if (userInitiated) {
      showToast(err.message, "error");
    }
  } finally {
    if (btnPreviewSheet) {
      btnPreviewSheet.disabled = false;
      btnPreviewSheet.textContent = "🔍 Inspect Sheet";
    }
  }
}

if (btnPreviewSheet) {
  btnPreviewSheet.addEventListener("click", () => inspectGoogleSheet(true));
}

async function runAutomationNow() {
  if (!btnRunAutomationNow) return;

  btnRunAutomationNow.disabled = true;
  btnRunAutomationNow.textContent = "Executing...";

  try {
    const res = await fetch("/api/automation/run-now", { method: "POST" });
    const data = await res.json();

    if (data.success) {
      showToast(data.message || "Automation executed successfully!", "success");
      await inspectGoogleSheet(false);
      await loadAutomationHistory();
    } else {
      throw new Error(data.message || "Automation failed");
    }
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btnRunAutomationNow.disabled = false;
    btnRunAutomationNow.textContent = "🚀 Run Automation Now";
  }
}

if (btnRunAutomationNow) {
  btnRunAutomationNow.addEventListener("click", runAutomationNow);
}

async function loadAutomationHistory() {
  const tableBody = document.getElementById("autoHistoryTableBody");
  if (!tableBody) return;

  try {
    const res = await fetch("/api/automation/history?limit=50");
    const json = await res.json();
    if (!json.success || !json.data || json.data.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">
            No automated messages dispatched yet.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = json.data.map(d => {
      let typeLabel = d.trigger_type;
      if (d.trigger_type === "BEFORE_CHECKIN" || d.trigger_type === "PRE_CHECKIN") {
        typeLabel = `<span style="color: #25d366; font-weight: 500;">🚗 Before Check-in</span>`;
      } else if (d.trigger_type === "ON_CHECKIN") {
        typeLabel = `<span style="color: #a78bfa; font-weight: 500;">🏨 On Check-in</span>`;
      } else if (d.trigger_type === "ON_CHECKOUT" || d.trigger_type === "CHECKOUT") {
        typeLabel = `<span style="color: #60a5fa; font-weight: 500;">🧳 On Check-out</span>`;
      } else if (d.trigger_type === "AFTER_CHECKOUT") {
        typeLabel = `<span style="color: #f59e0b; font-weight: 500;">⭐ After Check-out</span>`;
      }

      const statusBadge = d.status === "SENT"
        ? `<span class="status-badge" style="background: rgba(16,185,129,0.15); color: #10b981;">✓ SENT</span>`
        : `<span class="status-badge" style="background: rgba(239,68,68,0.15); color: #ef4444;" title="${escapeHtml(d.error_message || "")}">FAILED</span>`;

      const dateStr = d.dispatched_at ? new Date(d.dispatched_at).toLocaleString() : "—";

      return `
        <tr>
          <td style="font-size: 0.8rem; color: var(--text-muted); font-family: monospace;">${dateStr}</td>
          <td style="font-weight: 600;">${escapeHtml(d.guest_name || "Guest")}</td>
          <td style="font-family: monospace; font-size: 0.84rem;">+${d.clean_phone}</td>
          <td>${typeLabel}</td>
          <td style="font-size: 0.82rem; font-family: monospace; color: var(--accent-wa);">${d.template_name}</td>
          <td>${statusBadge}</td>
          <td style="font-size: 0.76rem; font-family: monospace; color: var(--text-subtle);">${d.meta_message_id || "—"}</td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    console.warn("Failed to load automation history:", err);
  }
}

if (btnRefreshAutoHistory) {
  btnRefreshAutoHistory.addEventListener("click", loadAutomationHistory);
}

// Run initial Meta check, templates load, webhook config & replies check on page load
initSystemTimeSync();
checkMetaStatus();
loadSystemTemplates();
updatePhoneMockup();
loadWebhookConfig();
loadCustomerReplies();
loadAutoReplySettings();
loadAutomationDashboard();
initSSE();


