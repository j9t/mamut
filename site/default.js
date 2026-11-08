import Alpine from '@alpinejs/csp';
import { createCooldown } from '../src/lib/cooldown.js';
import { correctHandle, parseHandle, parseServers, readDomain } from '../src/lib/input.js';
import { describeHomeServer, describeRequest, describeRestrictions, describeServer, labelMajor } from '../src/lib/labels.js';
import { isMajorTicked } from '../src/lib/servers.js';
import { labelSoftware } from '../src/lib/status.js';
import { checkAccount, InputError, SERVERS_MAJOR } from '../src/mamut.js';

const LABELS_CONFIDENCE = { high: 'High', low: 'Low', medium: 'Medium' };

const tryStartLookup = createCooldown(3000);
let controllerLookup = null;

const readHash = () => {
  try {
    return decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return '';
  }
};

const formatDate = (value) => new Date(value).toLocaleString('en', { dateStyle: 'long', timeStyle: 'short' });

// The CSP build of Alpine resolves plain properties only, so derived values are getters;
// valid HTML rules out `:attr` and `@event`, so those live in `x-bind` objects, under full
// names because Alpine maps its shorthands to the default prefix before `prefix()` runs
const mamut = () => ({
  busy: false,
  error: '',
  handle: '',
  majors: SERVERS_MAJOR.map(server => ({ checked: false, server })),
  result: null,
  run: 0,
  servers: '',

  bindButton: {
    'data-x-bind:aria-busy'() {
      return this.busy ? 'true' : null;
    },
    'data-x-bind:disabled'() {
      return this.busy;
    }
  },

  bindForm: {
    'data-x-on:reset.prevent'() {
      this.reset();
    },
    'data-x-on:submit.prevent'() {
      this.check();
    }
  },

  bindHome: {
    'data-x-on:click.prevent'() {
      this.reset();
    }
  },

  bindHandle: {
    'data-x-on:blur'() {
      this.handle = correctHandle(this.handle);
    },
    'data-x-bind:aria-invalid'() {
      return this.hasError ? 'true' : null;
    }
  },

  bindMajor: {
    'data-x-bind:checked'() {
      return isMajorTicked(this.entry, this.domain);
    },
    'data-x-bind:disabled'() {
      return this.entry.server === this.domain;
    },
    'data-x-on:change'(event) {
      this.entry.checked = event.target.checked;
    }
  },

  bindMajorLabel: {
    'data-x-text'() {
      return labelMajor(this.entry.server, this.domain);
    }
  },

  bindProfile: {
    'data-x-bind:href'() {
      return this.result.account.urlProfile;
    },
    'data-x-bind:rel'() {
      return 'noreferrer noopener';
    },
    'data-x-bind:target'() {
      return '_blank';
    }
  },

  bindToggleMajors: {
    'data-x-on:click.prevent'() {
      const checked = !this.areAllMajorsChecked;
      for (const entry of this.majors) entry.checked = checked;
    }
  },

  // An active account that other servers restrict isn’t shown as simply in good standing
  bindVerdict: {
    'data-x-bind:data-status'() {
      return this.result.status === 'active' && this.hasRestrictions ? 'limited' : this.result.status;
    }
  },

  get areAllMajorsChecked() {
    return this.majors.every(entry => isMajorTicked(entry, this.domain));
  },

  get buttonLabel() {
    return this.busy ? 'Checking…' : 'Check account';
  },

  get canClear() {
    return this.isActive || this.handle !== '' || this.servers !== '';
  },

  get domain() {
    return readDomain(this.handle);
  },

  get facts() {
    const { banExpires, checkedAt, confidence, host, software } = this.result;
    return [
      { label: 'Reported by', value: host },
      { label: 'Confidence', value: LABELS_CONFIDENCE[confidence] },
      software && { label: 'Server software', value: `${labelSoftware(software)} ${software.version ?? ''}`.trim() },
      banExpires && { label: 'Ban ends', value: formatDate(banExpires) },
      { label: 'Checked', value: formatDate(checkedAt) }
    ].filter(Boolean);
  },

  get hasError() {
    return this.error !== '';
  },

  get hasProfile() {
    return Boolean(this.result?.account.urlProfile);
  },

  get hasRestrictions() {
    return this.restrictions !== '';
  },

  get hasResult() {
    return this.result !== null;
  },

  get hasServers() {
    return this.result?.servers.length > 0;
  },

  get homeServerHint() {
    return describeHomeServer(this.domain);
  },

  get isActive() {
    return this.busy || this.hasError || this.hasResult;
  },

  get isErrorFree() {
    return !this.hasError;
  },

  get isHome() {
    return !this.isActive;
  },

  get isIdle() {
    return this.result === null;
  },

  get requestRows() {
    return this.result.requests.map(describeRequest);
  },

  get restrictions() {
    return describeRestrictions(this.result?.servers ?? []);
  },

  get serverRows() {
    return this.result.servers.map(entry => ({ server: entry.server, ...describeServer(entry) }));
  },

  get toggleMajorsLabel() {
    return this.areAllMajorsChecked ? 'uncheck all' : 'check all';
  },

  init() {
    // Links only fill in the form, so that shared or embedded links can’t generate traffic
    const fillFromHash = () => {
      const handle = readHash();
      if (handle) this.handle = correctHandle(handle);
    };
    window.addEventListener('hashchange', fillFromHash);
    fillFromHash();
  },

  // Advancing `run` also makes a check still in progress discard its result
  reset() {
    controllerLookup?.abort();
    this.run++;
    this.busy = false;
    this.error = '';
    this.handle = '';
    this.result = null;
    this.servers = '';
    for (const entry of this.majors) entry.checked = false;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    document.getElementById('handle').focus();
  },

  async check() {
    this.handle = correctHandle(this.handle);
    const run = ++this.run;
    this.busy = true;
    this.error = '';
    try {
      parseHandle(this.handle);
      const majors = this.majors.filter(entry => entry.checked).map(entry => entry.server);
      const servers = [...majors, ...parseServers(this.servers)];
      if (!tryStartLookup()) {
        this.error = 'Wait a few seconds before the next check.';
        return;
      }
      controllerLookup = new AbortController();
      const result = await checkAccount(this.handle, { servers, signal: controllerLookup.signal });
      if (run !== this.run) return;
      this.result = result;
      window.history.replaceState(null, '', `#${encodeURI(result.account.handle)}`);
    } catch (err) {
      if (run !== this.run) return;
      this.error = err instanceof InputError ? err.message : 'Something went wrong while checking this account. Try again.';
      this.result = null;
    } finally {
      if (run === this.run) this.busy = false;
    }
  }
});

Alpine.prefix('data-x-');
Alpine.data('mamut', mamut);
Alpine.start();