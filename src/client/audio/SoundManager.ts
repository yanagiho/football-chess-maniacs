// ============================================================
// SoundManager.ts — サウンド管理（C8）
// Web Audio API でビープ音を生成。外部ファイル不要。
// SettingsContext と連動（bgm/sfx ON/OFF, volume）
// ============================================================

type SoundId =
  | 'whistle_start' | 'whistle_end' | 'goal' | 'shoot' | 'pass'
  | 'tackle' | 'foul' | 'card' | 'click' | 'turn_confirm'
  | 'timer_warning' | 'pk_goal' | 'pk_save';

interface SoundDef {
  type: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise';
  freq?: number;
  duration: number;
  gain?: number;
}

const SOUND_DEFS: Record<SoundId, SoundDef> = {
  whistle_start:  { type: 'sine', freq: 2200, duration: 0.3, gain: 0.3 },
  whistle_end:    { type: 'sine', freq: 2200, duration: 0.8, gain: 0.3 },
  goal:           { type: 'noise', duration: 1.0, gain: 0.25 },
  shoot:          { type: 'triangle', freq: 300, duration: 0.15, gain: 0.4 },
  pass:           { type: 'sine', freq: 600, duration: 0.1, gain: 0.2 },
  tackle:         { type: 'square', freq: 150, duration: 0.15, gain: 0.3 },
  foul:           { type: 'sine', freq: 1800, duration: 0.4, gain: 0.25 },
  card:           { type: 'sawtooth', freq: 800, duration: 0.2, gain: 0.2 },
  click:          { type: 'sine', freq: 1000, duration: 0.05, gain: 0.15 },
  turn_confirm:   { type: 'sine', freq: 880, duration: 0.15, gain: 0.2 },
  timer_warning:  { type: 'square', freq: 1200, duration: 0.3, gain: 0.3 },
  pk_goal:        { type: 'noise', duration: 0.5, gain: 0.2 },
  pk_save:        { type: 'triangle', freq: 400, duration: 0.3, gain: 0.25 },
};

class SoundManager {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private volume = 0.8;

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setEnabled(enabled: boolean) { this.enabled = enabled; }
  setVolume(vol: number) { this.volume = Math.max(0, Math.min(1, vol / 100)); }

  play(id: SoundId) {
    if (!this.enabled) return;
    const def = SOUND_DEFS[id];
    if (!def) return;

    try {
      const ctx = this.getCtx();
      const gain = ctx.createGain();
      gain.gain.value = (def.gain ?? 0.2) * this.volume;
      gain.connect(ctx.destination);

      // フェードアウト
      gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + def.duration);

      if (def.type === 'noise') {
        // ホワイトノイズ
        const bufferSize = ctx.sampleRate * def.duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(gain);
        src.start();
        src.stop(ctx.currentTime + def.duration);
      } else {
        const osc = ctx.createOscillator();
        osc.type = def.type;
        osc.frequency.value = def.freq ?? 440;
        osc.connect(gain);
        osc.start();
        osc.stop(ctx.currentTime + def.duration);
      }
    } catch {
      // Audio not available
    }
  }
}

/** シングルトンインスタンス */
export const soundManager = new SoundManager();
