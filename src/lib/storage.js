/**
 * Persistent Storage Utilities
 * Handles auto-save with localStorage and optional cloud sync
 */

const STORAGE_KEYS = {
  CONTENT: 'wop_editor_content',
  CHAT_HISTORY: 'wop_chat_history',
  PREFERENCES: 'wop_preferences',
  LAST_SAVED: 'wop_last_saved',
};

// Debounce helper for auto-save
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Local Storage Operations
export const storage = {
  // Save content
  saveContent(content) {
    try {
      localStorage.setItem(STORAGE_KEYS.CONTENT, content);
      localStorage.setItem(STORAGE_KEYS.LAST_SAVED, new Date().toISOString());
      return true;
    } catch (e) {
      console.error('Failed to save content:', e);
      return false;
    }
  },

  // Load content
  loadContent() {
    try {
      return localStorage.getItem(STORAGE_KEYS.CONTENT) || null;
    } catch (e) {
      console.error('Failed to load content:', e);
      return null;
    }
  },

  // Save chat history
  saveChatHistory(history) {
    try {
      // Keep only last 50 messages to avoid storage limits
      const trimmed = history.slice(-50);
      localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(trimmed));
      return true;
    } catch (e) {
      console.error('Failed to save chat history:', e);
      return false;
    }
  },

  // Load chat history
  loadChatHistory() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Failed to load chat history:', e);
      return null;
    }
  },

  // Save preferences (selected modes, etc.)
  savePreferences(prefs) {
    try {
      localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(prefs));
      return true;
    } catch (e) {
      console.error('Failed to save preferences:', e);
      return false;
    }
  },

  // Load preferences
  loadPreferences() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Failed to load preferences:', e);
      return null;
    }
  },

  // Get last saved timestamp
  getLastSaved() {
    try {
      const timestamp = localStorage.getItem(STORAGE_KEYS.LAST_SAVED);
      return timestamp ? new Date(timestamp) : null;
    } catch (e) {
      return null;
    }
  },

  // Clear all stored data
  clearAll() {
    try {
      Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });
      return true;
    } catch (e) {
      console.error('Failed to clear storage:', e);
      return false;
    }
  },

  // Export all data as JSON (for backup)
  exportAll() {
    return {
      content: this.loadContent(),
      chatHistory: this.loadChatHistory(),
      preferences: this.loadPreferences(),
      exportedAt: new Date().toISOString(),
    };
  },

  // Import data from backup
  importAll(data) {
    try {
      if (data.content) this.saveContent(data.content);
      if (data.chatHistory) this.saveChatHistory(data.chatHistory);
      if (data.preferences) this.savePreferences(data.preferences);
      return true;
    } catch (e) {
      console.error('Failed to import data:', e);
      return false;
    }
  },
};

// Create auto-save functions with debouncing
export const autoSaveContent = debounce((content) => {
  storage.saveContent(content);
}, 2000); // Save 2 seconds after typing stops

export const autoSaveChatHistory = debounce((history) => {
  storage.saveChatHistory(history);
}, 1000);

export const autoSavePreferences = debounce((prefs) => {
  storage.savePreferences(prefs);
}, 500);

// Document versioning (keeps last 5 versions)
const VERSION_KEY = 'wop_versions';
const MAX_VERSIONS = 5;

export const versioning = {
  saveVersion(content, label = '') {
    try {
      const versions = this.getVersions();
      const newVersion = {
        id: Date.now(),
        content,
        label: label || `Version ${versions.length + 1}`,
        timestamp: new Date().toISOString(),
        wordCount: content.trim().split(/\s+/).filter(w => w.length > 0).length,
      };
      
      versions.unshift(newVersion);
      
      // Keep only MAX_VERSIONS
      while (versions.length > MAX_VERSIONS) {
        versions.pop();
      }
      
      localStorage.setItem(VERSION_KEY, JSON.stringify(versions));
      return newVersion;
    } catch (e) {
      console.error('Failed to save version:', e);
      return null;
    }
  },

  getVersions() {
    try {
      const data = localStorage.getItem(VERSION_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  restoreVersion(id) {
    const versions = this.getVersions();
    const version = versions.find(v => v.id === id);
    return version ? version.content : null;
  },

  deleteVersion(id) {
    try {
      const versions = this.getVersions().filter(v => v.id !== id);
      localStorage.setItem(VERSION_KEY, JSON.stringify(versions));
      return true;
    } catch (e) {
      return false;
    }
  },
};

export default storage;
