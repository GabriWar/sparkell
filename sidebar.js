// Sidebar settings management

let apiKeys = [];
let prompts = [];
let hotkeyAssignments = { 1: null, 2: null, 3: null, 4: null };
let currentEditingPromptId = null;
let isManualModelInput = false;

// Available models cache
let availableModels = {
  openrouter: [],
  gemini: [],
  anthropic: [
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
    { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' }
  ]
};

// Show status message
function showStatus(message, isError = false) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = isError ? 'status error' : 'status success';
  setTimeout(() => {
    status.style.display = 'none';
  }, 3000);
}

// Generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// === API KEYS MANAGEMENT ===

async function loadApiKeys() {
  try {
    const data = await chrome.storage.local.get(['apiKeys']);
    apiKeys = data.apiKeys || [];
    renderApiKeys();
  } catch (error) {
    console.error('Error loading API keys:', error);
  }
}

function renderApiKeys() {
  const dropdown = document.getElementById('api-keys-dropdown');
  dropdown.textContent = '';

  if (apiKeys.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No keys added yet';
    dropdown.appendChild(option);
    document.getElementById('selected-key-details').style.display = 'none';
    return;
  }

  // Add all keys to dropdown
  apiKeys.forEach((key, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = key.name || `${key.provider} Key`;
    dropdown.appendChild(option);
  });

  // Show first key by default
  dropdown.value = '0';
  showSelectedKeyDetails(0);
}

function showSelectedKeyDetails(index) {
  const key = apiKeys[index];
  if (!key) {
    document.getElementById('selected-key-details').style.display = 'none';
    return;
  }

  document.getElementById('selected-key-details').style.display = 'block';
  document.getElementById('selected-key-provider').textContent = key.name || `${key.provider} Key`;
  document.getElementById('selected-key-name').textContent = key.provider;
  document.getElementById('selected-key-value').textContent = '••••••••';

  // Store current selected index for buttons
  document.getElementById('selected-key-details').dataset.keyIndex = index;
}

function onApiKeyDropdownChange() {
  const dropdown = document.getElementById('api-keys-dropdown');
  const index = parseInt(dropdown.value);
  if (!isNaN(index)) {
    showSelectedKeyDetails(index);
  } else {
    document.getElementById('selected-key-details').style.display = 'none';
  }
}

async function addApiKey() {
  const provider = document.getElementById('new-key-provider').value;
  const name = document.getElementById('new-key-name').value.trim();
  const value = document.getElementById('new-key-value').value.trim();

  if (!provider) {
    showStatus('Please select a provider', true);
    return;
  }

  if (!value) {
    showStatus('Please enter an API key', true);
    return;
  }

  try {
    // Encrypt the key
    const encrypted = await CryptoHelper.encrypt(value);

    const newKey = {
      id: generateId(),
      provider: provider,
      name: name || `${provider} Key`,
      encryptedValue: encrypted,
      createdAt: Date.now()
    };

    apiKeys.push(newKey);
    await chrome.storage.local.set({ apiKeys });

    // Clear form
    document.getElementById('new-key-provider').value = '';
    document.getElementById('new-key-name').value = '';
    document.getElementById('new-key-value').value = '';

    renderApiKeys();
    showStatus('API key added successfully!');

    // Auto-fetch models
    fetchModelsForProvider(provider, apiKeys.length - 1);
  } catch (error) {
    showStatus('Error adding API key: ' + error.message, true);
  }
}

async function deleteApiKey(index) {
  if (!confirm('Are you sure you want to delete this API key?')) {
    return;
  }

  apiKeys.splice(index, 1);
  await chrome.storage.local.set({ apiKeys });
  renderApiKeys();
  showStatus('API key deleted');
}

// === MODEL FETCHING ===

async function fetchModelsForProvider(provider, keyIndex) {
  const key = apiKeys[keyIndex];

  if (!key) {
    showStatus('API key not found', true);
    return;
  }

  try {
    const decryptedKey = await CryptoHelper.decrypt(key.encryptedValue);

    if (!decryptedKey) {
      showStatus('Failed to decrypt API key', true);
      return;
    }

    showStatus(`Fetching models for ${provider}...`, false);

    if (provider === 'openrouter') {
      await fetchOpenRouterModels(decryptedKey);
    } else if (provider === 'gemini') {
      await fetchGeminiModels(decryptedKey);
    } else if (provider === 'anthropic') {
      // Anthropic doesn't have a list models endpoint, use hardcoded
      showStatus('Anthropic models loaded! 4 models available.');
    }

    // Update provider dropdown in modal
    updateModalProviders();
  } catch (error) {
    showStatus('Error: ' + error.message, true);
  }
}

async function fetchOpenRouterModels(apiKey) {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch OpenRouter models');
    }

    const data = await response.json();
    availableModels.openrouter = data.data.map(model => ({
      id: model.id,
      name: model.name || model.id
    }));

    showStatus(`Loaded ${availableModels.openrouter.length} OpenRouter models!`);
  } catch (error) {
    throw new Error('OpenRouter: ' + error.message);
  }
}

async function fetchGeminiModels(apiKey) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);

    if (!response.ok) {
      throw new Error('Failed to fetch Gemini models - check your API key');
    }

    const data = await response.json();

    // Filter for models that support generateContent (chat/text generation)
    availableModels.gemini = data.models
      .filter(model => model.supportedGenerationMethods?.includes('generateContent'))
      .map(model => ({
        id: model.name.replace('models/', ''), // Remove 'models/' prefix
        name: model.displayName || model.name
      }));

    showStatus(`Loaded ${availableModels.gemini.length} Gemini models!`);
  } catch (error) {
    throw new Error('Gemini: ' + error.message);
  }
}

// === PROMPTS MANAGEMENT ===

async function loadPrompts() {
  try {
    const data = await chrome.storage.local.get(['prompts', 'hotkeyAssignments']);
    prompts = data.prompts || [];
    hotkeyAssignments = data.hotkeyAssignments || { 1: null, 2: null, 3: null, 4: null };
    renderPrompts();
    updateHotkeyDropdowns();
  } catch (error) {
    console.error('Error loading prompts:', error);
  }
}

function renderPrompts() {
  const container = document.getElementById('prompts-list');

  if (prompts.length === 0) {
    container.textContent = 'No prompts created yet. Click "+ Add New Prompt" to get started.';
    return;
  }

  container.textContent = '';

  prompts.forEach((prompt, index) => {
    const item = document.createElement('div');
    item.className = 'prompt-item';

    const header = document.createElement('div');
    header.className = 'prompt-header';

    const title = document.createElement('div');
    const titleStrong = document.createElement('strong');
    titleStrong.textContent = prompt.name;
    const badge = document.createElement('span');
    badge.className = 'provider-badge';
    badge.textContent = `${prompt.provider} - ${prompt.model}`;
    title.appendChild(titleStrong);
    title.appendChild(badge);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '5px';

    // Show hotkey badge if assigned
    const assignedHotkey = Object.keys(hotkeyAssignments).find(k => hotkeyAssignments[k] === prompt.id);
    if (assignedHotkey) {
      const hotkeyBadge = document.createElement('span');
      hotkeyBadge.className = 'hotkey-badge';
      hotkeyBadge.textContent = `Alt+Shift+${assignedHotkey}`;
      actions.appendChild(hotkeyBadge);
    }

    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.className = 'small';
    editBtn.onclick = () => editPrompt(index);

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.className = 'small danger';
    deleteBtn.onclick = () => deletePrompt(index);

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    header.appendChild(title);
    header.appendChild(actions);

    const preview = document.createElement('div');
    preview.style.fontSize = '12px';
    preview.style.color = '#666';
    preview.style.marginTop = '8px';
    preview.textContent = prompt.text.substring(0, 100) + (prompt.text.length > 100 ? '...' : '');

    item.appendChild(header);
    item.appendChild(preview);

    container.appendChild(item);
  });
}

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

async function saveHotkeyAssignments() {
  for (let i = 1; i <= 4; i++) {
    const select = document.getElementById(`hotkey-${i}`);
    hotkeyAssignments[i] = select.value || null;
  }

  await chrome.storage.local.set({ hotkeyAssignments });
  showStatus('Hotkey assignments saved!');
  renderPrompts(); // Re-render to show badges
}

function toggleModelInput() {
  isManualModelInput = !isManualModelInput;

  const selectElement = document.getElementById('modal-model');
  const manualElement = document.getElementById('modal-model-manual');
  const toggleText = document.getElementById('model-input-type');

  if (isManualModelInput) {
    // Switch to manual input
    selectElement.style.display = 'none';
    manualElement.style.display = 'block';
    toggleText.textContent = 'Use Dropdown';

    // Copy value if exists
    if (selectElement.value) {
      manualElement.value = selectElement.value;
    }
  } else {
    // Switch to dropdown
    selectElement.style.display = 'block';
    manualElement.style.display = 'none';
    toggleText.textContent = 'Manual Entry';

    // Try to match manual value in dropdown
    const manualValue = manualElement.value;
    if (manualValue) {
      const option = Array.from(selectElement.options).find(opt => opt.value === manualValue);
      if (option) {
        selectElement.value = manualValue;
      }
    }
  }
}

function openPromptModal(prompt = null) {
  currentEditingPromptId = prompt ? prompt.id : null;

  // Reset to dropdown mode
  isManualModelInput = false;
  document.getElementById('modal-model').style.display = 'block';
  document.getElementById('modal-model-manual').style.display = 'none';
  document.getElementById('model-input-type').textContent = 'Manual Entry';

  // Update modal title
  document.querySelector('#prompt-modal h2').textContent = prompt ? 'Edit Prompt' : 'Add New Prompt';

  // Populate provider dropdown
  updateModalProviders();

  // Fill form if editing
  if (prompt) {
    document.getElementById('modal-prompt-name').value = prompt.name;
    document.getElementById('modal-provider').value = prompt.provider;
    updateModalModels(prompt.provider);
    setTimeout(() => {
      // Try to set in dropdown first
      const selectElement = document.getElementById('modal-model');
      const option = Array.from(selectElement.options).find(opt => opt.value === prompt.model);

      if (option) {
        selectElement.value = prompt.model;
      } else {
        // Model not in dropdown, switch to manual mode
        toggleModelInput();
        document.getElementById('modal-model-manual').value = prompt.model;
      }
    }, 100);
    document.getElementById('modal-prompt-text').value = prompt.text;
  } else {
    document.getElementById('modal-prompt-name').value = '';
    document.getElementById('modal-provider').value = '';
    document.getElementById('modal-model').textContent = '';
    document.getElementById('modal-model-manual').value = '';
    document.getElementById('modal-prompt-text').value = '';
  }

  document.getElementById('prompt-modal').style.display = 'block';
}

function closePromptModal() {
  document.getElementById('prompt-modal').style.display = 'none';
  currentEditingPromptId = null;
}

function updateModalProviders() {
  const select = document.getElementById('modal-provider');
  select.textContent = '';

  // Add default option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Select Provider';
  select.appendChild(defaultOption);

  // Add providers that have API keys
  const providers = [...new Set(apiKeys.map(k => k.provider))];

  providers.forEach(provider => {
    const option = document.createElement('option');
    option.value = provider;
    option.textContent = provider.charAt(0).toUpperCase() + provider.slice(1);
    select.appendChild(option);
  });
}

function updateModalModels(provider) {
  const select = document.getElementById('modal-model');
  select.textContent = '';

  if (!provider || !availableModels[provider]) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Select a provider first';
    select.appendChild(option);
    return;
  }

  const models = availableModels[provider];

  if (models.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No models available - fetch models first';
    select.appendChild(option);
    return;
  }

  models.forEach(model => {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.name;
    select.appendChild(option);
  });
}

async function savePrompt() {
  const name = document.getElementById('modal-prompt-name').value.trim();
  const provider = document.getElementById('modal-provider').value;

  // Get model from either dropdown or manual input
  const model = isManualModelInput
    ? document.getElementById('modal-model-manual').value.trim()
    : document.getElementById('modal-model').value;

  const text = document.getElementById('modal-prompt-text').value.trim();

  if (!name) {
    showStatus('Please enter a prompt name', true);
    return;
  }

  if (!provider) {
    showStatus('Please select a provider', true);
    return;
  }

  if (!model) {
    showStatus('Please enter or select a model', true);
    return;
  }

  if (!text) {
    showStatus('Please enter a prompt template', true);
    return;
  }

  const promptData = {
    id: currentEditingPromptId || generateId(),
    name,
    provider,
    model,
    text,
    updatedAt: Date.now()
  };

  if (currentEditingPromptId) {
    // Update existing
    const index = prompts.findIndex(p => p.id === currentEditingPromptId);
    if (index !== -1) {
      prompts[index] = promptData;
    }
  } else {
    // Add new
    prompts.push(promptData);
  }

  await chrome.storage.local.set({ prompts });
  renderPrompts();
  updateHotkeyDropdowns();
  closePromptModal();
  showStatus('Prompt saved successfully!');
}

function editPrompt(index) {
  openPromptModal(prompts[index]);
}

async function deletePrompt(index) {
  if (!confirm('Are you sure you want to delete this prompt?')) {
    return;
  }

  const promptId = prompts[index].id;

  // Remove from hotkey assignments
  Object.keys(hotkeyAssignments).forEach(key => {
    if (hotkeyAssignments[key] === promptId) {
      hotkeyAssignments[key] = null;
    }
  });

  prompts.splice(index, 1);

  await chrome.storage.local.set({ prompts, hotkeyAssignments });
  renderPrompts();
  updateHotkeyDropdowns();
  showStatus('Prompt deleted');
}

// === TOGGLE SECTIONS ===

function toggleApiKeys() {
  const content = document.getElementById('api-keys-content');
  const toggle = document.getElementById('api-keys-toggle');

  if (content.style.display === 'none') {
    content.style.display = 'block';
    toggle.textContent = '▲';
  } else {
    content.style.display = 'none';
    toggle.textContent = '▼';
  }
}

function toggleBackupRestoreSidebar() {
  const content = document.getElementById('backup-restore-content-sidebar');
  const toggle = document.getElementById('backup-restore-toggle-sidebar');

  if (content.style.display === 'none') {
    content.style.display = 'block';
    toggle.textContent = '▲';
  } else {
    content.style.display = 'none';
    toggle.textContent = '▼';
  }
}

// === BACKUP & RESTORE ===

async function exportPromptsSidebar() {
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

async function importPromptsSidebar() {
  const fileInput = document.getElementById('import-file-sidebar');
  fileInput.click();
}

async function handleFileImportSidebar(event) {
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
    await loadPrompts();

    showStatus(`Imported ${importData.prompts.length} prompts successfully!`);
  } catch (error) {
    showStatus('Error importing prompts: ' + error.message, true);
  }

  // Reset file input
  event.target.value = '';
}

// === EVENT LISTENERS ===

document.addEventListener('DOMContentLoaded', async () => {
  // Load data
  await loadApiKeys();
  await loadPrompts();

  // API Keys
  document.getElementById('api-keys-header').addEventListener('click', toggleApiKeys);
  document.getElementById('add-key-btn').addEventListener('click', addApiKey);
  document.getElementById('api-keys-dropdown').addEventListener('change', onApiKeyDropdownChange);
  document.getElementById('fetch-models-btn').addEventListener('click', () => {
    const details = document.getElementById('selected-key-details');
    const index = parseInt(details.dataset.keyIndex);
    if (!isNaN(index)) {
      const key = apiKeys[index];
      fetchModelsForProvider(key.provider, index);
    }
  });
  document.getElementById('delete-key-btn').addEventListener('click', () => {
    const details = document.getElementById('selected-key-details');
    const index = parseInt(details.dataset.keyIndex);
    if (!isNaN(index)) {
      deleteApiKey(index);
    }
  });

  // Prompts
  document.getElementById('add-prompt-btn').addEventListener('click', () => openPromptModal());
  document.getElementById('save-prompt-btn').addEventListener('click', savePrompt);
  document.getElementById('cancel-prompt-btn').addEventListener('click', closePromptModal);
  document.getElementById('save-hotkeys-btn').addEventListener('click', saveHotkeyAssignments);

  // Modal provider change
  document.getElementById('modal-provider').addEventListener('change', (e) => {
    updateModalModels(e.target.value);
  });

  // Modal fetch models
  document.getElementById('modal-fetch-models').addEventListener('click', async () => {
    const provider = document.getElementById('modal-provider').value;

    if (!provider) {
      showStatus('Please select a provider first', true);
      return;
    }

    // Find API key for this provider
    const key = apiKeys.find(k => k.provider === provider);

    if (!key) {
      showStatus(`No ${provider} API key found. Add one first.`, true);
      return;
    }

    // Get the index
    const keyIndex = apiKeys.indexOf(key);
    await fetchModelsForProvider(provider, keyIndex);
    updateModalModels(provider);
  });

  // Toggle model input type
  document.getElementById('toggle-model-input').addEventListener('click', toggleModelInput);

  // Backup & Restore
  document.getElementById('backup-restore-header-sidebar').addEventListener('click', toggleBackupRestoreSidebar);
  document.getElementById('export-prompts-sidebar').addEventListener('click', exportPromptsSidebar);
  document.getElementById('import-prompts-sidebar').addEventListener('click', importPromptsSidebar);
  document.getElementById('import-file-sidebar').addEventListener('change', handleFileImportSidebar);

  // Close modal on background click
  document.getElementById('prompt-modal').addEventListener('click', (e) => {
    if (e.target.id === 'prompt-modal') {
      closePromptModal();
    }
  });
});
