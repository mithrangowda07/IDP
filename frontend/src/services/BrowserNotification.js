/**
 * BrowserNotification.js
 * 
 * Helper service for requesting permission and showing native desktop notifications
 * using the HTML5 Notification API.
 */
class BrowserNotification {
  /**
   * Request permission for showing browser alerts if not yet granted/denied.
   * @returns {Promise<boolean>} True if permission is granted, false otherwise.
   */
  async requestPermission() {
    if (!('Notification' in window)) {
      console.warn('[BrowserNotification] Desktop notifications are not supported by this browser.');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }

  /**
   * Triggers a native browser notification
   * @param {string} title - Main notification title
   * @param {object} options - Suffix options (body, icon, etc.)
   */
  show(title, options = {}) {
    if (!('Notification' in window)) return;
    
    if (Notification.permission !== 'granted') {
      // Try to ask for permission
      this.requestPermission().then(granted => {
        if (granted) this.display(title, options);
      });
    } else {
      this.display(title, options);
    }
  }

  /**
   * Displays the notification
   */
  display(title, options) {
    try {
      const notification = new Notification(title, {
        tag: 'emergency-alert',
        renotify: true,
        silent: true, // Silent because we play our own custom synthesized alarm sound
        ...options
      });

      notification.onclick = () => {
        window.focus();
        if (options.onClick) {
          options.onClick();
        }
      };
    } catch (err) {
      console.warn('[BrowserNotification] Error displaying notification:', err);
    }
  }
}

export default new BrowserNotification();
