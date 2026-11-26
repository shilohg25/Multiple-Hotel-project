import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchJsonWithTimeout,
  fetchWithTimeout,
  isAbortOrTimeoutError,
  isNetworkError,
  RequestTimeoutError
} from './fetch-timeout.ts';

function abortingFetch(): typeof fetch {
  return ((_input, init) => new Promise((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) return;
    const fail = () => {
      const error = new Error('The operation was aborted.');
      error.name = 'AbortError';
      reject(error);
    };
    if (signal.aborted) fail();
    else signal.addEventListener('abort', fail, { once: true });
  })) as typeof fetch;
}

describe('fetchWithTimeout', () => {
  it('exports a 12 second default timeout', () => {
    assert.equal(DEFAULT_FETCH_TIMEOUT_MS, 12_000);
  });

  it('aborts a hung request and throws RequestTimeoutError', async () => {
    await assert.rejects(
      () => fetchWithTimeout('/api/ledger', { method: 'POST' }, { timeoutMs: 20, fetchImpl: abortingFetch() }),
      (error: unknown) => {
        assert.equal(error instanceof RequestTimeoutError, true);
        assert.equal(isAbortOrTimeoutError(error), true);
        assert.equal(isNetworkError(error), true);
        assert.equal((error as RequestTimeoutError).timeoutMs, 20);
        return true;
      }
    );
  });

  it('returns a successful response before the timeout', async () => {
    const fetchImpl = (async () => new Response('ok', { status: 200 })) as typeof fetch;
    const response = await fetchWithTimeout('/api/ledger', { method: 'POST' }, { timeoutMs: 50, fetchImpl });
    assert.equal(response.ok, true);
    assert.equal(await response.text(), 'ok');
  });

  it('treats a failed fetch TypeError as a network error', () => {
    assert.equal(isNetworkError(new TypeError('Failed to fetch')), true);
    assert.equal(isNetworkError(new Error('something else')), false);
  });
});

describe('fetchJsonWithTimeout', () => {
  it('returns parsed JSON when the body arrives before the timeout', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ entry: { id: 'ok' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })) as typeof fetch;
    const result = await fetchJsonWithTimeout('/api/ledger', { method: 'POST' }, { timeoutMs: 50, fetchImpl });
    assert.equal(result.response.ok, true);
    assert.deepEqual(result.json, { entry: { id: 'ok' } });
  });

  it('aborts if the JSON body stalls and throws RequestTimeoutError', async () => {
    const fetchImpl = (async (_input, init) => {
      const response = new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      Object.defineProperty(response, 'json', {
        value: () => new Promise((_resolve, reject) => {
          const fail = () => {
            const error = new Error('The operation was aborted.');
            error.name = 'AbortError';
            reject(error);
          };
          if (init?.signal?.aborted) fail();
          else init?.signal?.addEventListener('abort', fail, { once: true });
        })
      });
      return response;
    }) as typeof fetch;

    await assert.rejects(
      () => fetchJsonWithTimeout('/api/ledger', { method: 'POST' }, { timeoutMs: 25, fetchImpl }),
      (error: unknown) => {
        assert.equal(error instanceof RequestTimeoutError, true);
        assert.equal(isAbortOrTimeoutError(error), true);
        assert.equal((error as RequestTimeoutError).timeoutMs, 25);
        return true;
      }
    );
  });
});
