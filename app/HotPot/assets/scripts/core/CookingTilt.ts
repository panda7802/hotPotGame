interface Acceleration {x: number; y: number; z: number}
interface DeviceMotion {gamma: number}
interface MotionStart {interval: 'game'; fail: (error: unknown) => void}
interface MotionStop {complete: () => void}

interface WechatMotion {
  onAccelerometerChange?: (listener: (data: Acceleration) => void) => void;
  offAccelerometerChange?: (listener: (data: Acceleration) => void) => void;
  startAccelerometer?: (options: MotionStart) => void;
  stopAccelerometer?: (options: MotionStop) => void;
  onDeviceMotionChange?: (listener: (data: DeviceMotion) => void) => void;
  offDeviceMotionChange?: (listener: (data: DeviceMotion) => void) => void;
  startDeviceMotionListening?: (options: MotionStart) => void;
  stopDeviceMotionListening?: (options: MotionStop) => void;
}

declare const wx: WechatMotion | undefined;

export type TiltFailure = 'unsupported' | 'permission' | 'startup' | 'timeout';

function reportWechatFailure(sensor: string, error: unknown): TiltFailure | undefined {
  const failure = error as {errMsg?: string; errCode?: number; message?: string} | undefined;
  const message = failure?.errMsg ?? failure?.message ?? '';
  if (/already|重复|已开启/i.test(message)) return undefined;
  console.warn('[HotPot tilt] WeChat ' + sensor + ':', failure?.errCode, message);
  return /permission|privacy|authorize|denied|权限|隐私|授权/i.test(message)
    ? 'permission' : 'startup';
}

/** Reports the lateral tilt angle in degrees on both hosts. */
export class CookingTilt {
  private cleanup?: () => void;
  private timer?: ReturnType<typeof setTimeout>;
  private stopping?: Promise<void>;
  private generation = 0;

  start(read: (value: number) => void, unavailable: (reason: TiltFailure) => void): void {
    this.stop();
    const generation = this.generation;
    const fail = (reason: TiltFailure) => {
      if (generation !== this.generation || !this.cleanup) return;
      this.stop();
      unavailable(reason);
    };
    const sample = (angle: number) => {
      if (generation !== this.generation || !this.cleanup || !Number.isFinite(angle)) return;
      clearTimeout(this.timer);
      read(angle);
    };
    const globals = globalThis as {wx?: WechatMotion; GameGlobal?: {wx?: WechatMotion}};
    const host = typeof wx !== 'undefined' ? wx : globals.wx ?? globals.GameGlobal?.wx;
    if (host?.onDeviceMotionChange && host.offDeviceMotionChange
      && host.startDeviceMotionListening && host.stopDeviceMotionListening) {
      this.startWechatOrientation(host, generation, sample, fail);
      return;
    }
    if (host?.onAccelerometerChange) {
      this.startWechat(host, generation, sample, fail);
      return;
    }

    if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') {
      unavailable('unsupported');
      return;
    }
    const listener = (event: DeviceOrientationEvent) => {
      if (event.gamma !== null) sample(event.gamma);
    };
    const cleanup = () => window.removeEventListener('deviceorientation', listener);
    this.cleanup = cleanup;
    const listen = () => {
      if (this.cleanup !== cleanup) return;
      window.addEventListener('deviceorientation', listener);
      this.timer = setTimeout(() => fail('timeout'), 2500);
    };
    const api = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<string>;
    };
    try {
      if (api.requestPermission) {
        void api.requestPermission().then(result => {
          if (this.cleanup !== cleanup) return;
          if (result === 'granted') listen();
          else fail('permission');
        }).catch(() => { if (this.cleanup === cleanup) fail('permission'); });
      } else listen();
    } catch { fail('startup'); }
  }

  private startWechatOrientation(host: WechatMotion, generation: number,
    read: (angle: number) => void, fail: (reason: TiltFailure) => void): void {
    let attached = false;
    let received = false;
    const active = () => generation === this.generation && this.cleanup === cleanup;
    const listener = ({gamma}: DeviceMotion) => {
      if (!active() || !Number.isFinite(gamma)) return;
      received = true;
      // WeChat gamma is the Y-axis angle in radians. Browser gamma is in degrees.
      read(gamma * 180 / Math.PI);
    };
    const cleanup = () => {
      if (!attached) return;
      try { host.offDeviceMotionChange!(listener); }
      finally { this.stopWechat(options => host.stopDeviceMotionListening!(options)); }
    };
    const fallback = (reason: TiltFailure) => {
      if (!active() || received) return;
      if (!host.onAccelerometerChange) {
        fail(reason);
        return;
      }
      clearTimeout(this.timer);
      this.cleanup = undefined;
      try { cleanup(); } catch { /* The next sensor can still be attempted. */ }
      this.startWechat(host, generation, read, fail);
    };
    const startupError = (error: unknown) => {
      if (!active() || received) return;
      const reason = reportWechatFailure('device motion', error);
      if (reason) fallback(reason);
    };
    const attach = () => {
      if (!active()) return;
      this.timer = setTimeout(() => fallback('timeout'), 1800);
      try {
        attached = true;
        host.onDeviceMotionChange!(listener);
        host.startDeviceMotionListening!({interval: 'game', fail: startupError});
      } catch (error) { startupError(error); }
    };
    this.cleanup = cleanup;
    if (this.stopping) void this.stopping.then(attach);
    else attach();
  }

  private startWechat(host: WechatMotion, generation: number,
    read: (angle: number) => void, fail: (reason: TiltFailure) => void): void {
    let attached = false;
    let received = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let startupFailure: TiltFailure = 'timeout';
    const active = () => this.generation === generation;
    const listener = ({x, y, z}: Acceleration) => {
      const gravity = Math.hypot(x, y, z);
      const plane = Math.hypot(x, z);
      if (!active() || !Number.isFinite(gravity) || gravity < 0.15
        || plane < gravity * 0.12) return;
      received = true;
      clearTimeout(retry);
      read(Math.atan2(x, Math.abs(z)) * 180 / Math.PI);
    };
    const rememberError = (error: unknown) => {
      if (!active() || received) return;
      startupFailure = reportWechatFailure('accelerometer', error) ?? startupFailure;
    };
    this.cleanup = () => {
      clearTimeout(retry);
      if (!attached) return;
      try { host.offAccelerometerChange?.(listener); }
      finally {
        if (host.stopAccelerometer) this.stopWechat(options => host.stopAccelerometer!(options));
      }
    };
    const attach = () => {
      if (!active()) return;
      try {
        // Registering starts the sensor on WeChat. Explicit start is only a retry.
        attached = true;
        host.onAccelerometerChange!(listener);
      } catch (error) {
        rememberError(error);
        fail(startupFailure);
        return;
      }
      if (received) return;
      this.timer = setTimeout(() => fail(startupFailure), 4200);
      retry = setTimeout(() => {
        if (!active() || received) return;
        try { host.startAccelerometer?.({interval: 'game', fail: rememberError}); }
        catch (error) { rememberError(error); }
      }, 850);
    };
    if (this.stopping) void this.stopping.then(attach);
    else attach();
  }

  private stopWechat(stop: (options: MotionStop) => void): void {
    const pending = new Promise<void>(resolve => {
      const timeout = setTimeout(resolve, 600);
      const complete = () => { clearTimeout(timeout); resolve(); };
      try { stop({complete}); }
      catch { complete(); }
    });
    this.stopping = pending;
    void pending.then(() => {
      if (this.stopping === pending) this.stopping = undefined;
    });
  }

  stop(): void {
    this.generation++;
    clearTimeout(this.timer);
    const cleanup = this.cleanup;
    this.cleanup = undefined;
    try { cleanup?.(); } catch { /* Platform may already be suspended. */ }
  }
}
