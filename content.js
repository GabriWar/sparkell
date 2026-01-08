// Content script for AI Prompt Extension

console.log('AI Prompt Extension: Content script loaded');

// Store the current selection and editable element
let currentSelection = null;
let currentEditableElement = null;

// Get selected text and check if it's in an editable field
function getSelectionInfo() {
  let selectedText = '';
  let editableElement = null;
  let selection = null;
  let range = null;

  // Check if active element is input/textarea with selection
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
    const start = activeEl.selectionStart;
    const end = activeEl.selectionEnd;
    if (start !== end) {
      selectedText = activeEl.value.substring(start, end).trim();
      if (selectedText) {
        editableElement = activeEl;
        return {
          selectedText: selectedText,
          isEditable: true,
          element: editableElement,
          selection: null,
          range: null,
          inputStart: start,
          inputEnd: end
        };
      }
    }
  }

  // Check window selection (for contenteditable and regular text)
  selection = window.getSelection();
  selectedText = selection.toString().trim();

  if (!selectedText) {
    return { selectedText: '', isEditable: false, element: null };
  }

  // Get the element containing the selection
  range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const element = container.nodeType === 3 ? container.parentNode : container;

  // Check if inside contenteditable
  const contentEditable = element.closest('[contenteditable="true"]');
  if (contentEditable) {
    editableElement = contentEditable;
  }

  return {
    selectedText: selectedText,
    isEditable: !!editableElement,
    element: editableElement,
    selection: selection,
    range: range
  };
}

// Replace selected text in editable element
function replaceSelectedText(newText, selectionInfo) {
  const element = selectionInfo.element;

  if (!element) {
    console.error('No editable element found');
    return false;
  }

  // Handle input/textarea
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    // Use stored selection positions if available, otherwise use current
    const start = selectionInfo.inputStart !== undefined ? selectionInfo.inputStart : element.selectionStart;
    const end = selectionInfo.inputEnd !== undefined ? selectionInfo.inputEnd : element.selectionEnd;
    const currentValue = element.value;

    element.value = currentValue.substring(0, start) + newText + currentValue.substring(end);

    // Set cursor position after inserted text
    const newCursorPos = start + newText.length;
    element.selectionStart = newCursorPos;
    element.selectionEnd = newCursorPos;

    // Trigger input event for frameworks
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));

    return true;
  }

  // Handle contenteditable
  if (element.isContentEditable) {
    const range = selectionInfo.range;
    range.deleteContents();
    const textNode = document.createTextNode(newText);
    range.insertNode(textNode);

    // Move cursor to end of inserted text
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    // Trigger input event
    element.dispatchEvent(new Event('input', { bubbles: true }));

    return true;
  }

  return false;
}

// Show notification popup
function showNotification(message, options = {}) {
  // Remove existing notification
  const existing = document.getElementById('ai-prompt-notification');
  if (existing) {
    existing.remove();
  }

  // Create notification element
  const notification = document.createElement('div');
  notification.id = 'ai-prompt-notification';
  notification.textContent = message;

  // Style the notification
  Object.assign(notification.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    padding: '15px 20px',
    background: options.isError ? '#f44336' : options.isLoading ? '#2196F3' : '#4CAF50',
    color: 'white',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    zIndex: '999999',
    fontSize: '14px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    maxWidth: '400px',
    animation: 'slideIn 0.3s ease-out'
  });

  // Add animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(400px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(notification);

  // Auto-remove after delay (unless it's a loading notification)
  if (!options.isLoading) {
    setTimeout(() => {
      notification.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}

// Show result popup
function showResultPopup(result) {
  // Remove existing popup
  const existing = document.getElementById('ai-prompt-result-popup');
  if (existing) {
    existing.remove();
  }

  // Create popup container
  const popup = document.createElement('div');
  popup.id = 'ai-prompt-result-popup';

  // Style the popup
  Object.assign(popup.style, {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '500px',
    maxWidth: '90vw',
    padding: '20px',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    zIndex: '1000000',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#333'
  });

  // Create header
  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px'
  });

  const title = document.createElement('strong');
  title.textContent = 'AI Result';
  title.style.fontSize = '16px';

  const closeBtn = document.createElement('button');
  closeBtn.id = 'ai-popup-close';
  closeBtn.textContent = '×';
  Object.assign(closeBtn.style, {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#666'
  });

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Create result container
  const resultDiv = document.createElement('div');
  resultDiv.id = 'ai-popup-result';
  resultDiv.textContent = result;
  Object.assign(resultDiv.style, {
    maxHeight: '300px',
    overflowY: 'auto',
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    lineHeight: '1.6',
    marginBottom: '10px'
  });

  // Create button container
  const buttonContainer = document.createElement('div');
  Object.assign(buttonContainer.style, {
    display: 'flex',
    gap: '10px'
  });

  // Create insert button - always show, try to insert when clicked
  const insertBtn = document.createElement('button');
  insertBtn.id = 'ai-popup-insert';
  insertBtn.textContent = 'Insert';
  Object.assign(insertBtn.style, {
    flex: '1',
    padding: '10px',
    background: '#60A5FA',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px'
  });

  // Insert button handler - just try to insert
  insertBtn.addEventListener('click', () => {
    if (currentSelection) {
      const success = replaceSelectedText(result, currentSelection);
      if (success) {
        popup.remove();
        showNotification('Text inserted successfully!');
      } else {
        showNotification('Could not insert text here', { isError: true });
      }
    } else {
      showNotification('No text was selected', { isError: true });
    }
  });

  buttonContainer.appendChild(insertBtn);

  // Create copy button
  const copyBtn = document.createElement('button');
  copyBtn.id = 'ai-popup-copy';
  copyBtn.textContent = 'Copy to Clipboard';
  Object.assign(copyBtn.style, {
    flex: '1',
    padding: '10px',
    background: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px'
  });

  buttonContainer.appendChild(copyBtn);

  // Assemble popup
  popup.appendChild(header);
  popup.appendChild(resultDiv);
  popup.appendChild(buttonContainer);

  document.body.appendChild(popup);

  // Close button handler
  closeBtn.addEventListener('click', () => {
    popup.remove();
  });

  // Copy button handler
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(result).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.textContent = 'Copy to Clipboard';
      }, 2000);
    });
  });

  // Close on escape
  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      popup.remove();
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);

  // Close on background click
  popup.addEventListener('click', (e) => {
    if (e.target === popup) {
      popup.remove();
    }
  });
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSelectedText') {
    const info = getSelectionInfo();
    currentSelection = info;
    currentEditableElement = info.element;

    sendResponse({
      selectedText: info.selectedText
    });
    return true;
  }

  if (request.action === 'handlePromptResult') {
    const { result } = request;

    // Remove loading notification
    const notification = document.getElementById('ai-prompt-notification');
    if (notification) {
      notification.remove();
    }

    // Always show popup with result
    showResultPopup(result);

    return false;
  }

  if (request.action === 'showNotification') {
    showNotification(request.message, {
      isError: request.isError,
      isLoading: request.isLoading
    });
    return false;
  }

  return false;
});
