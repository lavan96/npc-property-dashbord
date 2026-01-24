type FetchArgs = Parameters<typeof fetch>;

const INSTALL_FLAG = '__accessLoggerInstalled';

function getRequestDetails(input: FetchArgs[0], init?: FetchArgs[1]) {
  if (input instanceof Request) {
    return {
      url: input.url,
      method: input.method,
    };
  }

  return {
    url: input.toString(),
    method: init?.method ?? 'GET',
  };
}

export function installAccessErrorLogger() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return;
  }

  const windowWithFlag = window as typeof window & { [INSTALL_FLAG]?: boolean };
  if (windowWithFlag[INSTALL_FLAG]) {
    return;
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: FetchArgs[0], init?: FetchArgs[1]) => {
    const response = await originalFetch(input, init);

    if (response.status === 401 || response.status === 403) {
      const details = getRequestDetails(input, init);
      console.warn(`[access] ${response.status} ${details.method} ${details.url}`);
    }

    return response;
  };

  windowWithFlag[INSTALL_FLAG] = true;
}
