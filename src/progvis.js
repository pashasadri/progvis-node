import zlib from "zlib";
import https from "https";
import http from "http";

import crypto from "crypto";
import { hostname } from "os";
import process from "process";
import path from "path";

const WAIT = 10 * 1000; // 10 seconds
const SERVER = process.env.PV_API || "https://progvis.com/api/v1/progress";

function _random_id() {
  return crypto.randomBytes(32).toString("hex");
}

function _now() {
  return Math.floor(Date.now() / 1000);
}

const DEFAULT_OPTS = {
  collect_argv: false,
  token: null,
  _server: SERVER
};

class ProgVis {
  constructor(name, expected = null, options = {}) {
    name = (name || '').trim();

    const _options = Object.assign({}, DEFAULT_OPTS, options);

    this._token = _options.token || process.env.PV_TOKEN;
    if (!this._token) {
      console.error(
        "PV: client token is required but is not specified in options nor .env"
      );
    }

    this._server = _options._server;

    const argv = process.argv.slice(1);
    const base = path.parse(argv[0]).base;

    if (!name) {
      console.warn(`PV: Consider specifying a name. Defaulted to "${base}"`);
    }

    const collect = !!_options.collect_argv;

    name = name || base;
    // TODO: require name
    this._data = {
      uuid: _random_id(),
      name,
      argv: collect ? argv.join(" ") : "not collected",
      host: collect ? hostname() : "not.collected",
      state: "init",
      start: _now(),
      end_ts: null,
      expected,
      curr: 0,
      steps: [], // array of { s: 1, t: ts, p: 5 }
      msgs: [] // array of { s: 3, t: ts, m: ... }
    };

    this._seq = 0;

    this._error = 0;

    if (0) {
      // TODO: make this an option
      this._monitor = (err, origin) => this._exception(err, origin);
      process.once("uncaughtException", this._monitor);
    }

    this._send = debounce(() => this._upload(), WAIT, WAIT);
    this._flush = debounce(() => this._send.flush(), 100, 1000);

    this._immediate();
  }

  _immediate() {
    this._send();
    this._flush();
  }

  _exception(err, origin) {
    this.log(`uncaught exception: ${err} @ ${origin || "unknown"}`);
    this.error();
    process.exitCode = 1;
  }

  _upload() {
    if (!this._token) {
      return;
    }

    if (this._inflight) {
      this._queue = true;
      return;
    }

    this._inflight = true;

    const data = this._data;
    data.client_ms = Date.now();

    const clone = JSON.stringify(data);

    // reset
    data.msgs = [];
    data.steps = [];
    data.client_ms = null;

    const url = new URL(this._server);
    url.searchParams.set("token", this._token);

    post(url, clone, (error, res, body) => {
      this._inflight = false;
      // TODO: handle 401 errors
      if (error || res.statusCode !== 200) {
        this._error++;

        if (res && res.statusCode === 401) {
          this._token = null;
          console.error("PV: client token is invalid");
          return;
        }

        // restore steps and msgs we tried to send
        const old = JSON.parse(clone);
        data.msgs = old.msgs.concat(...data.msgs);
        data.steps = old.steps.concat(...data.steps);

        if (this._error > 5) {
          return;
        }
        // TODO: handle backoffs
        if (this._queue) {
          this._queue = false;
          this._immediate();
        } else {
          this._send();
        }
        return;
      }

      this._error = 0;
      if (this._queue) {
        this._queue = false;
        this._immediate();
      }
      // TODO do something with reply
    });
  }

  step(delta = 1) {
    delta = parseInt(delta, 10);
    if (delta < 1) {
      console.warn("PV .step() called with non-numeric or < 1 value");
      return;
    }

    const data = this._data;
    if (data.end_ts) {
      console.warn(`PV "${data.name}" is already in "${data.state}" state`);
      return;
    }

    data.curr += delta;
    const t = _now();
    const s = this._seq++;
    data.steps.push({
      t: _now(),
      p: delta,
      s: this._seq++
    });

    if (data.state != "running") {
      data.state = "running";
      this._immediate();
    } else {
      this._send();
    }
  }

  log(data) {
    if (!data) return;

    this._data.msgs.push({
      t: _now(),
      m: clone(data),
      s: this._seq++
    });

    this._send();
  }

  _end() {
    // TODO: make this based on option
    if (0) {
      process.off("uncaughtExceptionMonitor", this._monitor);
    }
    this._data.end_ts = _now();
    this._immediate();
  }

  done() {
    const data = this._data;
    if (data.end_ts) {
      console.warn(`PV "${data.name}" is already in "${data.state}" state`);
      return;
    }
    data.state = "done";
    this._end();
  }

  error() {
    const data = this._data;
    if (data.end_ts) {
      console.warn(`PV "${data.name}" is already in "${data.state}" state`);
      return;
    }
    data.state = "error";
    this._end();
  }
}

function clone(x) {
  if (x) {
    return JSON.parse(JSON.stringify(x));
  } else {
    return null;
  }
}

function once(cb) {
  let called = false;
  return (...args) => {
    if (called) return;
    called = true;
    cb(...args);
  };
}

function post(url, payload, cb) {
  cb = once(cb);

  const protocol = url.protocol === "https:" ? https : http;

  const options = {
    method: "POST",
    timeout: 5000
  };

  // TODO: support compress replies
  // const headers = { 'accept-encoding': 'gzip, deflate' }

  zlib.gzip(payload, (err, buffer) => {
    if (err) {
      cb(err);
      return;
    }

    options.headers = {
      "Content-Encoding": "gzip",
      "Content-Length": buffer.length,
      "Content-Type": "application/json"
    };

    const req = protocol.request(url, options, res => {
      res.setEncoding("utf8"); // note: not requesting or handling compressed response
      let body = "";
      res.on("data", chunk => (body = body + chunk));
      // TODO: decompress data
      res.on("end", () => {
        cb(null, res, body);
      });
    });

    req.on("timeout", () => {
      req.abort();
      cb(new Error("Request timed out"));
    });

    req.on("error", cb);

    req.write(buffer);
    req.end();
  });
}

function debounce(fn, wait, max) {
  let timer; // timer id
  let last; // last time fn was actually invoked

  function cb() {
    last = Date.now();
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    fn();
  }

  function wrapped() {
    const remain = Math.max(0, last ? max - (Date.now() - last) : max);
    const delay = Math.min(remain, wait);

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    timer = setTimeout(cb, delay);
  }

  wrapped.flush = cb;

  return wrapped;
}

module.exports = ProgVis;
