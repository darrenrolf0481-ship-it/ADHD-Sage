// src/lib/audio-pulse.ts
class PulseGenerator {
  private audioCtx: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  public active = false;

  toggle() {
    if (this.active) {
      this.stop();
    } else {
      this.start();
    }
    return this.active;
  }

  private start() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    this.oscillator = this.audioCtx.createOscillator();
    this.gainNode = this.audioCtx.createGain();

    // 11.3Hz tone which acts as a rhythmic pulse
    this.oscillator.type = 'sawtooth';
    this.oscillator.frequency.value = 11.3;

    // Filter to make it sound ambient
    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 80; // Cut off high frequencies

    this.gainNode.gain.value = 0;
    // Fade in
    this.gainNode.gain.setTargetAtTime(0.06, this.audioCtx.currentTime, 0.5);

    this.oscillator.connect(filter);
    filter.connect(this.gainNode);
    this.gainNode.connect(this.audioCtx.destination);

    this.oscillator.start();
    this.active = true;
  }

  private stop() {
    if (this.gainNode && this.audioCtx) {
      this.gainNode.gain.setTargetAtTime(0, this.audioCtx.currentTime, 0.5);
      
      const osc = this.oscillator;
      const gain = this.gainNode;
      setTimeout(() => {
        try {
          osc?.stop();
          osc?.disconnect();
          gain.disconnect();
        } catch(e) {}
      }, 1000);
      
      this.oscillator = null;
      this.gainNode = null;
    }
    this.active = false;
  }
}

export const pulseGenerator = new PulseGenerator();
