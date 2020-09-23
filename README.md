# ProgVis Node Client

This is the Node client library for ProgVis.

ProgVis is a simple to use tool for instrumenting periodic and long running
batch jobs so you can easily track their progress and state.

### Table of Contents

  * [Screenshot](#screenshot)
  * [Features](#features)
  * [Installation](#installation)
  * [Example Usage](#example-usage)
  * [API](#api)
  * [Roadmap](#roadmap)
  * [License](#license)

### Screenshot

[ProgVis Web UI](https://progvis.com) lets you track current and past jobs, view logs, etc.

Here is a sample screen grab:

![Sample Progress Bars](/images/sample_output.png)

### Features

ProgVis lets you...

* Track your cron and batch jobs as they run to completion.
* Keep records of each run - when they ran, for how long & exit status.
* Search/view logs to help with troubleshooting.
* Compare to historical stats to spot performance issues.

### Installation

Install ProgVis Node Client using npm or yarn.

```
$ npm install progvis
```

Then visit [ProgVis](https://progvis.com), register and get a client access token.

Set your client access token as PV_TOKEN environement variable or pass it in as
options.token to the ProgVis constructor.

### Example Usage

> :information_source: if you can't modify your program, you can use [ProgVis CLI](https://github.com/pashasadri/progvis-cli) to track your jobs.

ProgVis API is similar to cli progress tracking libraries.  Instead of logging
to terminal, it uploads progress data to progvis.com where you can access it.

```javascript
import ProgVis from "progvis";

async function main() {
  const things = await getThingsToProcess();

  // opts = { token: <ACCESS_TOKEN> }
  const pv = new ProgVis("job_name", things.length, opts);

  while (things.length) {
    const thing = things.shift();
    const result = await process(thing);
    pv.step(1);                // indicate you made some progress
    pv.log({ thing, result }); // optionally log some stuff
  })

  pv.done(); // success OR pv.error(); for failure
}

main();
...

```

### API

#### new ProgVis(name, [expected], [options])

Construct a new ProgVis instance.

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| name | <code>string</code> |  | A unique, stable name for this job |
| [expected] | <code>number</code> |  | Number of expected steps for this job |
| [options] | <code>object</code>  |
| [options.collect_argv] | <code>boolean</code> | <code>false</code> | Enable collecting argv. :warning: Don't use if args contains sensitive information |
| [options.token] | <code>string</code> |  | API Access Token.  Takes precedence over env.PV_TOKEN |


#### .step([delta = 1])

Increment progress by specifed amount. Defaults to 1.

#### .log(data)

Make a log entry. 'data' has to be JSON serializable.

#### .done()

Indicate the job has completed successfully.

> :warning: If .done() is not called for any reason, the job will be marked as 'zombie' and eventually as 'error'.

#### .error()

Indicate the job did not complete successfully.

### Roadmap

- [ ] Realtime updates using WebSockets
- [ ] Alerts / Notifications on job anamolies
- [ ] Capture system metrics (memory, cpu etc...)
- [ ] Recover from client crashes (save a crashfile and upload on next invocation)
- [ ] Different types of visualization

### License

ProgVis Node Client is [MIT Licensed](./LICENSE).
