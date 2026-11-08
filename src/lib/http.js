const BYTES_MAX = 8 * 1024 * 1024;
const TIMEOUT = 10_000;

class ResponseTooLargeError extends Error {}

/** @param {Response} response */
const readText = async (response) => {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    bytes += value.byteLength;
    if (bytes > BYTES_MAX) {
      await reader.cancel();
      throw new ResponseTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
};

/** @param {unknown} err */
const classifyFailure = (err) => {
  if (err instanceof ResponseTooLargeError) return 'too-large';
  if (err?.name === 'TimeoutError') return 'timeout';
  return err?.name === 'AbortError' ? 'aborted' : 'network';
};

/** @param {string} text */
const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/**
 * Never throws for HTTP or network problems, as each one is a signal to interpret
 * @param {{fetcher?: typeof fetch, signal?: AbortSignal}} [options]
 */
export const createClient = ({ fetcher = globalThis.fetch.bind(globalThis), signal } = {}) => {
  const requests = [];

  const request = async (url, { accept = 'application/json', method = 'GET', payload, read = true } = {}) => {
    if (signal?.aborted) return { failure: 'aborted', json: null, status: null };

    const init = {
      credentials: 'omit',
      headers: { Accept: accept, ...(payload && { 'Content-Type': 'application/json' }) },
      method,
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT)]) : AbortSignal.timeout(TIMEOUT)
    };
    if (payload) init.body = JSON.stringify(payload);

    let failure = null;
    let json = null;
    let status = null;
    try {
      const response = await fetcher(url, init);
      status = response.status;
      if (read) {
        json = parseJson(await readText(response));
      } else {
        await response.body?.cancel();
      }
    } catch (err) {
      failure = classifyFailure(err);
    }

    requests.push({ failure, method, status, url });
    return { failure, json, status };
  };

  return { request, requests };
};