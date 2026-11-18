/** 浏览器按需加载官方 SDK；微信端继续使用内置云接口，不打包此 SDK。 */
const SDK_URL =
  'https://static.cloudbase.net/cloudbase-js-sdk/3.10.4/cloudbase.full.js';
let sdkPromise: Promise<any> | null = null;

export function hasWebCloudRuntime(): boolean {
  return !!(globalThis as any).document?.createElement;
}

function loadSdk(): Promise<any> {
  const browser = globalThis as any;
  if (browser.cloudbase?.init) {
    return Promise.resolve(browser.cloudbase);
  }
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const script = browser.document.createElement('script');
      const fail = (): void => {
        clearTimeout(timer);
        script.remove();
        sdkPromise = null;
        reject(new Error('WEB_SDK_UNAVAILABLE'));
      };
      const timer = setTimeout(fail, 15000);
      script.src = SDK_URL;
      script.async = true;
      script.onerror = fail;
      script.onload = (): void => {
        clearTimeout(timer);
        if (!browser.cloudbase?.init) {
          fail();
          return;
        }
        resolve(browser.cloudbase);
      };
      browser.document.head.appendChild(script);
    });
  }
  return sdkPromise;
}

/** SDK 负责持久会话与令牌刷新；不将调用者提供的身份当作云端身份。 */
export async function createWebCloud(config: {
  environmentId: string;
}): Promise<any> {
  const sdk = await loadSdk();
  const app = sdk.init({env: config.environmentId});
  const auth = app.auth({persistence: 'local'});
  let session = await auth.getSession();
  // 无效/过期凭据需要重新访客登录；网络故障则保留身份等待重试。
  // 只更新 SDK 会话，不清理游戏存档或待上传通关记录。
  if (session.error && session.error.category !== 'INVALID_CREDENTIALS') {
    throw session.error;
  }
  if (!session.data?.session) {
    session = await auth.signInAnonymously();
    if (session.error) {
      throw session.error;
    }
  }
  if (!session.data?.session) {
    throw new Error('WEB_IDENTITY_REQUIRED');
  }
  return {
    platform: 'web',
    init(): void {},
    callFunction({name, data, success, fail}: any): void {
      app.callFunction({name, data}).then(success, fail);
    },
  };
}
