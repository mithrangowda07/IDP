/**
 * EmergencyAlarm.js
 * 
 * Programmatically synthesizes emergency alert sirens using the Web Audio API.
 * This guarantees zero reliance on external media files and works flawlessly
 * in any modern web browser.
 */
class EmergencyAlarm {
  constructor() {
    this.audioCtx = null;
    this.oscillator = null;
    this.gainNode = null;
    this.intervalId = null;
    this.playingType = null;
  }

  /**
   * Initializes the AudioContext on demand (must occur inside a user gesture event handler)
   */
  init() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  /**
   * Start playing the alarm continuous loop
   * @param {string} incidentType - 'fire', 'medical_emergency', 'gas_leak', 'accident' (or other types)
   */
  play(incidentType) {
    try {
      this.init();
    } catch (err) {
      console.warn('[EmergencyAlarm] AudioContext failed to initialize:', err);
      return;
    }

    if (this.playingType) {
      if (this.playingType === incidentType) return; // Already running this exact siren
      this.stop();
    }

    this.playingType = incidentType;
    this.gainNode = this.audioCtx.createGain();
    this.gainNode.gain.setValueAtTime(0.25, this.audioCtx.currentTime); // Standard safe volume
    this.gainNode.connect(this.audioCtx.destination);

    console.log(`[EmergencyAlarm] Playing synthesized alarm loop for: ${incidentType}`);

    if (incidentType === 'fire') {
      // Fire siren: Alternating dual-frequency sawtooth waves (700Hz and 950Hz)
      this.oscillator = this.audioCtx.createOscillator();
      this.oscillator.type = 'sawtooth';
      this.oscillator.frequency.setValueAtTime(700, this.audioCtx.currentTime);
      this.oscillator.connect(this.gainNode);
      this.oscillator.start();

      let toggle = false;
      this.intervalId = setInterval(() => {
        if (!this.audioCtx || this.audioCtx.state === 'suspended') return;
        const now = this.audioCtx.currentTime;
        // Glide frequency over 0.2s
        this.oscillator.frequency.exponentialRampToValueAtTime(toggle ? 700 : 950, now + 0.2);
        toggle = !toggle;
      }, 400);

    } else if (incidentType === 'medical_emergency' || incidentType === 'medical') {
      // Ambulance siren: Classic wailing sweep (650Hz to 1100Hz and back)
      this.oscillator = this.audioCtx.createOscillator();
      this.oscillator.type = 'sine';
      this.oscillator.frequency.setValueAtTime(650, this.audioCtx.currentTime);
      this.oscillator.connect(this.gainNode);
      this.oscillator.start();

      let direction = true;
      this.intervalId = setInterval(() => {
        if (!this.audioCtx || this.audioCtx.state === 'suspended') return;
        const now = this.audioCtx.currentTime;
        this.oscillator.frequency.exponentialRampToValueAtTime(direction ? 1100 : 650, now + 0.7);
        direction = !direction;
      }, 800);

    } else if (incidentType === 'gas_leak') {
      // Gas Leak: Pulsing warning horn (220Hz low frequency pulse at 300ms intervals)
      this.oscillator = this.audioCtx.createOscillator();
      this.oscillator.type = 'triangle';
      this.oscillator.frequency.setValueAtTime(220, this.audioCtx.currentTime);
      this.oscillator.connect(this.gainNode);
      this.oscillator.start();

      this.intervalId = setInterval(() => {
        if (!this.audioCtx || this.audioCtx.state === 'suspended') return;
        const now = this.audioCtx.currentTime;
        // Pulse gain
        this.gainNode.gain.setValueAtTime(0.25, now);
        this.gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      }, 300);

    } else {
      // Accident (or default): Short, high-frequency square wave beeps
      this.oscillator = this.audioCtx.createOscillator();
      this.oscillator.type = 'square';
      this.oscillator.frequency.setValueAtTime(1600, this.audioCtx.currentTime);
      this.oscillator.connect(this.gainNode);
      this.oscillator.start();

      this.intervalId = setInterval(() => {
        if (!this.audioCtx || this.audioCtx.state === 'suspended') return;
        const now = this.audioCtx.currentTime;
        this.gainNode.gain.setValueAtTime(0.25, now);
        this.gainNode.gain.setValueAtTime(0.0, now + 0.1);
      }, 250);
    }
  }

  /**
   * Stop the currently playing alarm
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    try {
      if (this.oscillator) {
        this.oscillator.stop();
        this.oscillator.disconnect();
        this.oscillator = null;
      }
      if (this.gainNode) {
        this.gainNode.disconnect();
        this.gainNode = null;
      }
    } catch (e) {
      // Ignore cleanup errors
    }
    
    this.playingType = null;
  }

  /**
   * Returns whether an alarm is playing
   * @returns {boolean}
   */
  isPlaying() {
    return this.playingType !== null;
  }
}

export default new EmergencyAlarm();
