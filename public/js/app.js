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

async function loadSystemTemplates(selectedIdOrName = null) {
  const container = document.getElementById("savedTemplatesListContainer");
  if (!container) return;

  try {
    const res = await fetch("/api/templates");
    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      savedSystemTemplates = data.data;
      renderSystemTemplatePills(selectedIdOrName);
    }
  } catch (err) {
    console.warn("Failed to load saved system templates:", err.message);
  }
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
    DEFAULT_TEMPLATE_NAME: (document.getElementById("settingTemplateName")?.value || "kt_invitation_").trim()
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

// Run initial Meta check & load system templates on page load
checkMetaStatus();
loadSystemTemplates();
updatePhoneMockup();
