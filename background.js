// Background service worker

console.log('AI Prompt Extension: Background service worker loaded');

// Crypto helper (embedded for service worker)
const CryptoHelper = {
  async getEncryptionKey() {
    let keyData = await chrome.storage.local.get(['encryptionKey']);
    if (!keyData.encryptionKey) {
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      const exported = await crypto.subtle.exportKey('jwk', key);
      await chrome.storage.local.set({ encryptionKey: exported });
      return key;
    } else {
      return await crypto.subtle.importKey(
        'jwk',
        keyData.encryptionKey,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
    }
  },

  async decrypt(encryptedText) {
    try {
      const key = await this.getEncryptionKey();
      const combined = Uint8Array.from(atob(encryptedText), c => c.charCodeAt(0));
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        encrypted
      );
      return new TextDecoder().decode(decrypted);
    } catch (error) {
      console.error('Decryption failed:', error);
      return null;
    }
  }
};

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  console.log('Command received:', command);

  // Handle prompt commands (prompt-1, prompt-2, etc.)
  const match = command.match(/^prompt-(\d+)$/);
  if (match) {
    const hotkeyNum = parseInt(match[1]);
    await executeHotkeyPrompt(hotkeyNum);
  }
});

// Execute prompt assigned to a hotkey
async function executeHotkeyPrompt(hotkeyNum) {
  try {
    // Get hotkey assignments and prompts
    const data = await chrome.storage.local.get(['hotkeyAssignments', 'prompts', 'apiKeys']);
    const hotkeyAssignments = data.hotkeyAssignments || {};
    const prompts = data.prompts || [];
    const apiKeys = data.apiKeys || [];

    // Find which prompt is assigned to this hotkey
    const promptId = hotkeyAssignments[hotkeyNum];

    if (!promptId) {
      await showNotification(`No prompt assigned to Alt+Shift+${hotkeyNum}. Open settings to assign one.`, true);
      return;
    }

    // Find the prompt
    const prompt = prompts.find(p => p.id === promptId);

    if (!prompt) {
      await showNotification(`Prompt not found. Please check your settings.`, true);
      return;
    }

    // Get selected text
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      console.error('No active tab found');
      return;
    }

    // Check if we can access this page
    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) {
      console.error('Cannot access this page:', tab.url);
      return;
    }

    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { action: 'getSelectedText' });
    } catch (error) {
      console.error('Error connecting to page:', error);
      // Try to inject content script
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        // Wait a bit for script to load
        await new Promise(resolve => setTimeout(resolve, 100));
        response = await chrome.tabs.sendMessage(tab.id, { action: 'getSelectedText' });
      } catch (injectError) {
        console.error('Cannot inject content script:', injectError);
        return;
      }
    }

    if (!response || !response.selectedText) {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'showNotification',
        message: 'Please select some text first',
        isError: true
      });
      return;
    }

    const selectedText = response.selectedText;

    // Show loading notification
    await chrome.tabs.sendMessage(tab.id, {
      action: 'showNotification',
      message: `Executing "${prompt.name}"...`,
      isLoading: true
    });

    // Find API key for this provider
    const apiKey = apiKeys.find(k => k.provider === prompt.provider);

    if (!apiKey) {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'showNotification',
        message: `No ${prompt.provider} API key found. Add one in settings.`,
        isError: true
      });
      return;
    }

    // Decrypt the API key
    const decryptedKey = await CryptoHelper.decrypt(apiKey.encryptedValue);

    if (!decryptedKey) {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'showNotification',
        message: `Failed to decrypt API key`,
        isError: true
      });
      return;
    }

    // Execute the AI prompt
    try {
      const result = await callAI(prompt, selectedText, decryptedKey);

      // Send result back to content script
      await chrome.tabs.sendMessage(tab.id, {
        action: 'handlePromptResult',
        result: result
      });
    } catch (error) {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'showNotification',
        message: `Error: ${error.message}`,
        isError: true
      });
    }
  } catch (error) {
    console.error('Error executing hotkey prompt:', error);
  }
}

// Show notification helper
async function showNotification(message, isError = false) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    await chrome.tabs.sendMessage(tab.id, {
      action: 'showNotification',
      message: message,
      isError: isError
    });
  }
}

// Call AI API
async function callAI(prompt, selectedText, apiKey) {
  const provider = prompt.provider;
  const model = prompt.model;
  const promptText = prompt.text.replace('{text}', selectedText);

  if (provider === 'openrouter') {
    return await callOpenRouter(promptText, model, apiKey);
  } else if (provider === 'gemini') {
    return await callGemini(promptText, model, apiKey);
  } else if (provider === 'anthropic') {
    return await callAnthropic(promptText, model, apiKey);
  } else {
    throw new Error('Unknown provider: ' + provider);
  }
}

// OpenRouter API
async function callOpenRouter(prompt, model, apiKey) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': chrome.runtime.getURL(''),
      'X-Title': 'AI Prompt Extension'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Google Gemini API
async function callGemini(prompt, model, apiKey) {
  // Ensure model doesn't have 'models/' prefix
  const modelName = model.startsWith('models/') ? model : model;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

// Anthropic API
async function callAnthropic(prompt, model, apiKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 4096,
      messages: [
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  return data.content[0].text;
}
