import request from "request";
import _ from "lodash";
import { v4 as uuidv4 } from "uuid";
import { hostname } from "os";
import process from "process";
import path from "path";

const WAIT = 10 * 1000; // 10 seconds
const SERVER = process.env.PV_API || "https://progvis.com/api/v1/progress";

function _now() {
  return Math.floor(Date.now() / 1000);
}

const DEFAULT_OPTS = {
  collect_argv: false,
  token: null,
  _server: SERVER
};

class ProgVis {
  constructor(name = null, expected = null, options = {}) {
    const _options = _.defaults(options, DEFAULT_OPTS);

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

    name = _.trim(name) || base;
    // TODO: require name
    this._data = {
      uuid: uuidv4(),
      name,
      argv: _options.collect_argv ? argv.join(" ") : "not_collected",
      host: hostname(),
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

    this._send = _.throttle(() => this._upload(), WAIT);
    this._send();
  }

  _immediate() {
    this._send();
    this._send.flush();
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
    const clone = _.clone(data);
    clone.client_ms = Date.now();

    // reset
    data.msgs = [];
    data.steps = [];

    // console.log(JSON.stringify(clone, null, null, 2));

    request.post(
      {
        url: this._server,
        timeout: 5000,
        qs: { token: this._token },
        json: clone
      },
      (error, res, body) => {
        this._inflight = false;
        // TODO: handle 401 errors
        if (error || res.statusCode !== 200) {
          this._error++;
          data.msgs = clone.msgs.concat(...data.msgs);
          data.steps = clone.steps.concat(...data.steps);
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
      }
    );
  }

  step(delta = 1) {
    const data = this._data;
    // TODO: check if progress is positive
    // TODO: extend expected?
    data.curr += delta;
    const t = _now();
    const s = this._seq++;
    data.steps.push({ s, t, delta });

    this._send();

    // TODO: maybe only from init?
    if (data.state != "running") {
      data.state = "running";
      this._send.flush();
    }
  }

  log(data) {
    m = _.clone(data);
    const t = _now();
    const s = this._seq++;
    this._data.msgs.push({ s, t, m });

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
    this._data.state = "done";
    this._end();
  }

  error() {
    this._data.state = "error";
    this._end();
  }
}

module.exports = ProgVis;
