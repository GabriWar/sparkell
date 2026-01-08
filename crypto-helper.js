// Crypto helper for encrypting/decrypting API keys

const CryptoHelper = {
  // Generate or retrieve encryption key
  async getEncryptionKey() {
    let keyData = await chrome.storage.local.get(['encryptionKey']);

    if (!keyData.encryptionKey) {
      // Generate new key
      const key = await window.crypto.subtle.generateKey(
        {
          name: 'AES-GCM',
          length: 256
        },
        true,
        ['encrypt', 'decrypt']
      );

      // Export and store key
      const exported = await window.crypto.subtle.exportKey('jwk', key);
      await chrome.storage.local.set({ encryptionKey: exported });
      return key;
    } else {
      // Import existing key
      return await window.crypto.subtle.importKey(
        'jwk',
        keyData.encryptionKey,
        {
          name: 'AES-GCM',
          length: 256
        },
        true,
        ['encrypt', 'decrypt']
      );
    }
  },

  // Encrypt data
  async encrypt(text) {
    const key = await this.getEncryptionKey();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);

    const encrypted = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      encoded
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    // Convert to base64 for storage
    return btoa(String.fromCharCode.apply(null, combined));
  },

  // Decrypt data
  async decrypt(encryptedText) {
    try {
      const key = await this.getEncryptionKey();
      const combined = Uint8Array.from(atob(encryptedText), c => c.charCodeAt(0));

      // Extract IV and encrypted data
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);

      const decrypted = await window.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
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
