/**
 * Compares pixel output of two implementation directories (e.g. baseline snapshot vs working tree).
 * Output must be bit-identical for the perturbation algorithms. For the float algorithm the only
 * allowed difference is a pixel the baseline iterated to max_iter that the optimized version
 * classified as interior analytically (both must yield the interior marker value 2, so any
 * difference at all is reported).
 *
 * Usage: node test/compareImpls.mjs <dirA> <dirB>
 */
import * as tasks from './testtasks.mjs'
import {loadImpls, taskFromView, parseRawTask, renderWindow, FAVORITE_PERT} from './benchlib.mjs'

const dirA = process.argv[2] || '/tmp/mandelbrot-baseline'
const dirB = process.argv[3] || new URL('..', import.meta.url).pathname

const A = await loadImpls(dirA)
const B = await loadImpls(dirB)

const CASES = [
    {name: 'float-I50000', cls: 'MandelbrotFloat', task: i => parseRawTask(i.fxp, tasks.I50000), window: [[280, 210], [240, 180]], tile: 0},
    {name: 'float-I50000-tiled', cls: 'MandelbrotFloat', task: i => parseRawTask(i.fxp, tasks.I50000), window: [[0, 0], [160, 120]], tile: 32},
    {name: 'float-shallow', cls: 'MandelbrotFloat', task: i => taskFromView(i.fxp, {center: [{bigInt: (-1n << 57n).toString(), scale: 58}, {bigInt: '0', scale: 58}], zoom: {bigInt: (1n << 58n).toString(), scale: 58}, max_iter: 1000}, 320, 240), window: [[0, 0], [320, 240]], tile: 0},
    {name: 'float-shallow-nosmooth', cls: 'MandelbrotFloat', task: i => {const t = taskFromView(i.fxp, {center: [{bigInt: (-1n << 57n).toString(), scale: 58}, {bigInt: '0', scale: 58}], zoom: {bigInt: (1n << 58n).toString(), scale: 58}, max_iter: 1000}, 320, 240); t.smooth = false; return t}, window: [[0, 0], [320, 240]], tile: 0},
    {name: 'pert-E64', cls: 'MandelbrotPerturbation', task: i => taskFromView(i.fxp, FAVORITE_PERT, 800, 600), window: [[200, 150], [400, 300]], tile: 0},
    {name: 'pert-E64-tiled', cls: 'MandelbrotPerturbation', task: i => taskFromView(i.fxp, FAVORITE_PERT, 800, 600), window: [[200, 150], [400, 300]], tile: 32},
    {name: 'ext-E316', cls: 'MandelbrotPerturbationExtFloat', task: i => parseRawTask(i.fxp, tasks.E316), window: [[336, 252], [128, 96]], tile: 0},
    {name: 'ext-E1000', cls: 'MandelbrotPerturbationExtFloat', task: i => parseRawTask(i.fxp, tasks.E1000), window: [[336, 252], [128, 96]], tile: 0},
    {name: 'ext-E1000-tiled', cls: 'MandelbrotPerturbationExtFloat', task: i => parseRawTask(i.fxp, tasks.E1000), window: [[336, 252], [96, 96]], tile: 32},
]

async function runCase(impls, c) {
    const impl = new impls[c.cls](new impls.WorkerContext())
    const t = c.task(impls)
    t.resetCaches = true
    return renderWindow(impl, impl.ctx, t, c.window[0], c.window[1], {tile: c.tile, jobId: 42})
}

let failed = false
for (const c of CASES) {
    const ra = await runCase(A, c)
    const rb = await runCase(B, c)
    let diffs = 0
    let firstDiff = null
    const n = ra.values.length
    for (let i = 0; i < n; i++) {
        const va = ra.values[i]
        const vb = rb.values[i]
        const sa = ra.smooth ? ra.smooth[i] : 0
        const sb = rb.smooth ? rb.smooth[i] : 0
        if (va !== vb || sa !== sb) {
            diffs++
            if (!firstDiff) firstDiff = {i, va, vb, sa, sb}
        }
    }
    const status = diffs === 0 ? 'OK  ' : 'DIFF'
    console.log(`${status} ${c.name.padEnd(24)} pixels ${n}, diffs ${diffs}${firstDiff ? ` first@${firstDiff.i}: values ${firstDiff.va}->${firstDiff.vb} smooth ${firstDiff.sa}->${firstDiff.sb}` : ''}`)
    if (diffs > 0) failed = true
}
process.exit(failed ? 1 : 0)
