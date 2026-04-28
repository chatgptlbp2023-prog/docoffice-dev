/** @jest-environment node */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

function createJsonResponse(body, init = {}) {
  const status = init.status || 200;
  const ok = init.ok ?? (status >= 200 && status < 300);
  return {
    ok,
    status,
    headers: {
      get(name) {
        return String(name || '').toLowerCase() === 'content-type'
          ? 'application/json'
          : null;
      }
    },
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function bootFrontend(overrides = {}) {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://localhost:3000',
    pretendToBeVisual: true,
    runScripts: 'outside-only'
  });

  const { window } = dom;
  const fetchMock = overrides.fetchMock || jest.fn(async url => {
    const target = String(url);

    if (target.includes('/auth/google/config')) {
      return createJsonResponse({ enabled: false, clientId: null });
    }

    if (target.includes('/auth/me')) {
      return createJsonResponse({ user: null }, { status: 401, ok: false });
    }

    return createJsonResponse({});
  });

  Object.assign(window, {
    fetch: fetchMock,
    confirm: overrides.confirm || jest.fn(() => true),
    alert: overrides.alert || jest.fn(),
    scrollTo: overrides.scrollTo || jest.fn(),
    google: {
      accounts: {
        id: {
          initialize: jest.fn(),
          renderButton: jest.fn()
        }
      }
    }
  });

  window.setInterval = jest.fn(() => 1);
  window.clearInterval = jest.fn();
  window.setTimeout = jest.fn(() => 1);
  window.clearTimeout = jest.fn();

  class MockFileReader {
    readAsDataURL() {
      this.result = 'data:image/png;base64,AAA=';
      if (typeof this.onload === 'function') {
        this.onload({ target: { result: this.result } });
      }
    }
  }

  window.FileReader = MockFileReader;

  const script = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'app.js'), 'utf8');
  vm.runInContext(script, dom.getInternalVMContext());
  await flushMicrotasks();

  return { dom, window, document: window.document, fetchMock };
}

module.exports = {
  createJsonResponse,
  flushMicrotasks,
  bootFrontend
};
