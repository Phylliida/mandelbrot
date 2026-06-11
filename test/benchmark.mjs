/**
 * Benchmark for the CPU mandelbrot implementations.
 *
 * Usage: node test/benchmark.mjs [implDir] [scenarioFilter] [reps]
 *   implDir   directory containing the mandelbrot*.mjs files (default: repo root)
 *   scenario  substring filter on scenario names (default: all)
 *   reps      timed repetitions (default 5)
 */
import * as tasks from './testtasks.mjs'
import {loadImpls, taskFromView, parseRawTask, renderWindow, summarize, FAVORITE_PERT} from './benchlib.mjs'

const implDir = process.argv[2] || new URL('..', import.meta.url).pathname
const filter = process.argv[3] || ''
const REPS = Number(process.argv[4] || 5)

const impls = await loadImpls(implDir)

const FULL_SET_VIEW = (max_iter) => ({
    center: [{bigInt: (-1n << 57n).toString(), scale: 58}, {bigInt: '0', scale: 58}],
    zoom: {bigInt: (1n << 58n).toString(), scale: 58},
    max_iter,
})

const SCENARIOS = [
    {
        name: 'float-fullset-iter1000-320x240',
        make: () => new impls.MandelbrotFloat(new impls.WorkerContext()),
        task: () => taskFromView(impls.fxp, FULL_SET_VIEW(1000), 320, 240),
        window: [[0, 0], [320, 240]],
        tile: 0,
    },
    {
        name: 'float-fullset-iter50000-320x240',
        make: () => new impls.MandelbrotFloat(new impls.WorkerContext()),
        task: () => taskFromView(impls.fxp, FULL_SET_VIEW(50000), 320, 240),
        window: [[0, 0], [320, 240]],
        tile: 0,
    },
    {
        name: 'float-I50000-240x180',
        make: () => new impls.MandelbrotFloat(new impls.WorkerContext()),
        task: () => parseRawTask(impls.fxp, tasks.I50000),
        window: [[280, 210], [240, 180]],
        tile: 0,
    },
    {
        name: 'float-I50000-240x180-tiled32',
        make: () => new impls.MandelbrotFloat(new impls.WorkerContext()),
        task: () => parseRawTask(impls.fxp, tasks.I50000),
        window: [[280, 210], [240, 180]],
        tile: 32,
    },
    {
        name: 'pert-E64-400x300',
        make: () => new impls.MandelbrotPerturbation(new impls.WorkerContext()),
        task: () => taskFromView(impls.fxp, FAVORITE_PERT, 800, 600),
        window: [[200, 150], [400, 300]],
        tile: 0,
    },
    {
        name: 'pert-E64-400x300-tiled32',
        make: () => new impls.MandelbrotPerturbation(new impls.WorkerContext()),
        task: () => taskFromView(impls.fxp, FAVORITE_PERT, 800, 600),
        window: [[200, 150], [400, 300]],
        tile: 32,
    },
    {
        name: 'ext-E316-128x96',
        make: () => new impls.MandelbrotPerturbationExtFloat(new impls.WorkerContext()),
        task: () => parseRawTask(impls.fxp, tasks.E316),
        window: [[336, 252], [128, 96]],
        tile: 0,
    },
    {
        name: 'ext-E1000-128x96',
        make: () => new impls.MandelbrotPerturbationExtFloat(new impls.WorkerContext()),
        task: () => parseRawTask(impls.fxp, tasks.E1000),
        window: [[336, 252], [128, 96]],
        tile: 0,
    },
    {
        name: 'ext-E1000-128x96-tiled32',
        make: () => new impls.MandelbrotPerturbationExtFloat(new impls.WorkerContext()),
        task: () => parseRawTask(impls.fxp, tasks.E1000),
        window: [[336, 252], [128, 96]],
        tile: 32,
    },
]

function median(xs) {
    const s = [...xs].sort((a, b) => a - b)
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

const results = {}
for (const sc of SCENARIOS) {
    if (filter && !sc.name.includes(filter)) continue
    const impl = sc.make()
    const baseTask = sc.task()
    const times = []
    let fingerprint = null
    const warmups = 1
    for (let rep = 0; rep < REPS + warmups; rep++) {
        const t = Object.assign({}, baseTask)
        t.resetCaches = true // fresh reference points every rep -> stable, comparable timings
        const start = performance.now()
        const {values} = await renderWindow(impl, impl.ctx, t, sc.window[0], sc.window[1], {
            tile: sc.tile,
            jobId: rep + 1, // new jobId so resetCaches takes effect
        })
        const ms = performance.now() - start
        if (rep >= warmups) times.push(ms)
        fingerprint = summarize(values)
    }
    const med = median(times)
    results[sc.name] = {median: med, min: Math.min(...times), times, fingerprint}
    console.log(
        `${sc.name.padEnd(32)} median ${med.toFixed(1).padStart(8)}ms  min ${Math.min(...times).toFixed(1).padStart(8)}ms  hash ${fingerprint.hash} interior ${fingerprint.interior}`)
}

if (process.env.BENCH_JSON) {
    const {writeFileSync} = await import('node:fs')
    writeFileSync(process.env.BENCH_JSON, JSON.stringify(results, null, 2))
}
