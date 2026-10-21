// Client Supabase finto: registra le chiamate e restituisce le risposte preparate dal test.

function respond(source, ...args) {
  const value = typeof source === 'function' ? source(...args) : source;
  return Promise.resolve(value ?? { data: null, error: null });
}

class Query {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.ops = [];
  }

  then(resolve, reject) {
    this.client.calls.push(['from', this.table, this.ops]);
    return respond(this.client.responses.from[this.table], this.ops, this.table).then(resolve, reject);
  }
}

for (const name of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'is', 'or', 'lt', 'gt', 'gte', 'order', 'limit', 'range', 'single', 'maybeSingle']) {
  Query.prototype[name] = function chain(...args) {
    this.ops.push([name, ...args]);
    return this;
  };
}

function fakeChannel(client, name, options) {
  const channel = {
    name,
    options,
    handlers: [],
    tracked: [],
    on(type, filter, handler) {
      this.handlers.push({ type, filter, handler });
      return this;
    },
    subscribe(callback) {
      client.subscribed.push(this);
      callback?.('SUBSCRIBED');
      return this;
    },
    track(meta) {
      this.tracked.push(meta);
      return Promise.resolve('ok');
    },
    presenceState() {
      return client.presence;
    },
    emit(type, payload) {
      for (const h of this.handlers) {
        if (h.type === type && (!h.filter?.table || h.filter.table === payload.table)) h.handler(payload);
      }
    },
  };
  client.channels.push(channel);
  return channel;
}

export const processLock = async (name, timeout, fn) => fn();

export function createClient(url, key, options) {
  const client = {
    url,
    key,
    options,
    calls: [],
    channels: [],
    subscribed: [],
    removed: [],
    presence: {},
    authListeners: [],
    responses: { rpc: {}, from: {}, auth: {}, functions: {}, storage: {} },
    reset() {
      this.calls = [];
      this.channels = [];
      this.subscribed = [];
      this.removed = [];
      this.responses = { rpc: {}, from: {}, auth: {}, functions: {}, storage: {} };
    },
    rpc(name, params) {
      this.calls.push(['rpc', name, params]);
      return respond(this.responses.rpc[name], params);
    },
    from(table) {
      return new Query(this, table);
    },
    channel(name, opts) {
      return fakeChannel(this, name, opts);
    },
    removeChannel(channel) {
      this.removed.push(channel);
    },
    realtime: {
      setAuth(token) {
        client.calls.push(['realtime.setAuth', token]);
      },
    },
    storage: {
      from(bucket) {
        const call = (name) => (...args) => {
          client.calls.push([`storage.${name}`, bucket, ...args]);
          return respond(client.responses.storage?.[name], ...args);
        };
        return { upload: call('upload'), download: call('download'), remove: call('remove') };
      },
    },
    functions: {
      invoke(name, opts) {
        client.calls.push(['functions.invoke', name, opts]);
        return respond(client.responses.functions[name], opts);
      },
    },
  };

  const authCall = (name) => (...args) => {
    client.calls.push([`auth.${name}`, ...args]);
    return respond(client.responses.auth[name], ...args);
  };
  client.auth = {
    getSession: authCall('getSession'),
    signInWithPassword: authCall('signInWithPassword'),
    signOut: authCall('signOut'),
    resetPasswordForEmail: authCall('resetPasswordForEmail'),
    updateUser: authCall('updateUser'),
    onAuthStateChange(callback) {
      client.authListeners.push(callback);
      return { data: { subscription: { unsubscribe() {} } } };
    },
    mfa: {
      getAuthenticatorAssuranceLevel: authCall('getAuthenticatorAssuranceLevel'),
      listFactors: authCall('listFactors'),
      enroll: authCall('enroll'),
      challengeAndVerify: authCall('challengeAndVerify'),
      unenroll: authCall('unenroll'),
    },
  };
  globalThis.__fakeSupabase = client;
  return client;
}
