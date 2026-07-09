/**
 * TitleFlasher.js
 * 
 * Flashes the document tab title (e.g. alternating between "🚨 NEW FIRE ALERT" and 
 * the original dashboard title) to alert operators when they have navigated away.
 */
class TitleFlasher {
  constructor() {
    this.intervalId = null;
    this.originalTitle = document.title || 'Emergency Dashboard';
  }

  /**
   * Starts the tab title flash loop
   * @param {string} incidentType - The type of incident (e.g., 'fire', 'accident')
   */
  start(incidentType) {
    if (this.intervalId) return; // Already running

    this.originalTitle = document.title;
    const alertLabel = incidentType.toUpperCase().replace('_', ' ');
    const alertTitle = `🚨 NEW ${alertLabel} ALERT`;
    let toggle = false;

    this.intervalId = setInterval(() => {
      document.title = toggle ? alertTitle : this.originalTitle;
      toggle = !toggle;
    }, 1000);
  }

  /**
   * Stops the flash loop and restores the original tab title
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      document.title = this.originalTitle;
    }
  }
}

export default new TitleFlasher();
