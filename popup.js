// Popup script

let prompts = [];
let hotkeyAssignments = { 1: null, 2: null, 3: null, 4: null };

// Show status message
function showStatus(message, isError = false) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = isError ? 'status error' : 'status success';
  setTimeout(() => {
    status.style.display = 'none';
  }, 2500);
}

// Load prompts and hotkey assignments
async function loadData() {
  try {
    const data = await chrome.storage.local.get(['prompts', 'hotkeyAssignments']);
    prompts = data.prompts || [];
    hotkeyAssignments = data.hotkeyAssignments || { 1: null, 2: null, 3: null, 4: null };

    updateHotkeyDropdowns();
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

// Update hotkey dropdowns
function updateHotkeyDropdowns() {
  for (let i = 1; i <= 4; i++) {
    const select = document.getElementById(`hotkey-${i}`);
    select.textContent = '';

    // Add "None" option
    const noneOption = document.createElement('option');
    noneOption.value = '';
    noneOption.textContent = '-- None --';
    select.appendChild(noneOption);

    // Add all prompts
    prompts.forEach(prompt => {
      const option = document.createElement('option');
      option.value = prompt.id;
      option.textContent = prompt.name;
      select.appendChild(option);
    });

    // Set current value
    if (hotkeyAssignments[i]) {
      select.value = hotkeyAssignments[i];
    }
  }
}

// Save hotkey assignments
async function saveShortcuts() {
  for (let i = 1; i <= 4; i++) {
    const select = document.getElementById(`hotkey-${i}`);
    hotkeyAssignments[i] = select.value || null;
  }

  try {
    await chrome.storage.local.set({ hotkeyAssignments });
    showStatus('Shortcuts saved successfully!');
  } catch (error) {
    showStatus('Error saving shortcuts: ' + error.message, true);
  }
}

// Open settings in a new tab
async function openSettings() {
  try {
    await chrome.tabs.create({ url: 'sidebar.html' });
    self.close();
  } catch (error) {
    console.error('Error opening settings:', error);
    showStatus('Error opening settings: ' + error.message, true);
  }
}

// Export prompts to JSON
async function exportPrompts() {
  try {
    const data = await chrome.storage.local.get(['prompts', 'hotkeyAssignments']);
    const exportData = {
      prompts: data.prompts || [],
      hotkeyAssignments: data.hotkeyAssignments || { 1: null, 2: null, 3: null, 4: null },
      exportDate: new Date().toISOString(),
      version: '1.0'
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sparkell-prompts-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showStatus('Prompts exported successfully!');
  } catch (error) {
    showStatus('Error exporting prompts: ' + error.message, true);
  }
}

// Toggle backup & restore section
function toggleBackupRestore() {
  const content = document.getElementById('backup-restore-content');
  const toggle = document.getElementById('backup-restore-toggle');

  if (content.style.display === 'none') {
    content.style.display = 'block';
    toggle.textContent = '▲';
  } else {
    content.style.display = 'none';
    toggle.textContent = '▼';
  }
}

// Import prompts from JSON
async function importPrompts() {
  const fileInput = document.getElementById('import-file');
  fileInput.click();
}

// Handle file selection
async function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const importData = JSON.parse(text);

    if (!importData.prompts || !Array.isArray(importData.prompts)) {
      throw new Error('Invalid file format');
    }

    // Save imported data
    await chrome.storage.local.set({
      prompts: importData.prompts,
      hotkeyAssignments: importData.hotkeyAssignments || { 1: null, 2: null, 3: null, 4: null }
    });

    // Reload data
    await loadData();

    showStatus(`Imported ${importData.prompts.length} prompts successfully!`);
  } catch (error) {
    showStatus('Error importing prompts: ' + error.message, true);
  }

  // Reset file input
  event.target.value = '';
}

document.addEventListener('DOMContentLoaded', function() {
  // Load data
  loadData();

  // Event listeners
  document.getElementById('save-shortcuts').addEventListener('click', saveShortcuts);
  document.getElementById('open-settings').addEventListener('click', openSettings);
  document.getElementById('backup-restore-header').addEventListener('click', toggleBackupRestore);
  document.getElementById('export-prompts').addEventListener('click', exportPrompts);
  document.getElementById('import-prompts').addEventListener('click', importPrompts);
  document.getElementById('import-file').addEventListener('change', handleFileImport);
});
