import { useCallback, useState } from 'react';

/**
 * 识别接口配置：地址 + 可选令牌，存在 localStorage。
 *
 * 为什么放浏览器而不是构建期环境变量：
 * 老师/学生自己就能填，改完立刻生效，不用重新构建部署。
 * 代价是令牌对同浏览器可见，所以这里只适合放课程自用的轻量接口；
 * 真正的模型 API Key 必须留在服务端（server/index.mjs）。
 */

const KEY_ENDPOINT = 'ed:recognize-endpoint';
const KEY_TOKEN = 'ed:recognize-token';

export interface EndpointConfig {
  endpoint: string;
  token: string;
}

function readStorage(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeStorage(key: string, value: string): void {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    /* 隐私模式下 localStorage 可能不可写，忽略即可 */
  }
}

export interface EndpointSettings extends EndpointConfig {
  /** 地址是否已填写（决定走真实服务还是提示用户去填） */
  configured: boolean;
  save: (next: EndpointConfig) => void;
  clear: () => void;
}

export function useEndpointSettings(fallbackEndpoint = ''): EndpointSettings {
  const [config, setConfig] = useState<EndpointConfig>(() => ({
    endpoint: readStorage(KEY_ENDPOINT) || fallbackEndpoint,
    token: readStorage(KEY_TOKEN),
  }));

  const save = useCallback((next: EndpointConfig) => {
    setConfig(next);
    writeStorage(KEY_ENDPOINT, next.endpoint);
    writeStorage(KEY_TOKEN, next.token);
  }, []);

  const clear = useCallback(() => {
    setConfig({ endpoint: '', token: '' });
    writeStorage(KEY_ENDPOINT, '');
    writeStorage(KEY_TOKEN, '');
  }, []);

  return {
    ...config,
    configured: config.endpoint.trim() !== '',
    save,
    clear,
  };
}
