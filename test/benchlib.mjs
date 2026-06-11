/**
 * Shared helpers for benchmarking/comparing the CPU mandelbrot implementations.
 * Loads an implementation set from an arbitrary directory so that a baseline
 * snapshot and the working tree can be compared against each other.
 */
import {pathToFileURL} from 'node:url'
import * as path from 'node:path'

export async function loadImpls(dir) {
    const u = (f) => pathToFileURL(path.resolve(dir, f)).href
    const [flt, pert, ext, wctx, fxp] = await Promise.all([
        import(u('mandelbrotFloat.mjs')),
        import(u('mandelbrotPerturbation.mjs')),
        import(u('mandelbrotPerturbationExtFloat.mjs')),
        import(u('workerContext.mjs')),
        import(u('fxp.mjs')),
    ])
    return {
        MandelbrotFloat: flt.MandelbrotFloat,
        MandelbrotPerturbation: pert.MandelbrotPerturbation,
        MandelbrotPerturbationExtFloat: ext.MandelbrotPerturbationExtFloat,
        WorkerContext: wctx.WorkerContext,
        fxp,
    }
}

// Decoded favorite #3 from favorites.js (zoom ≈ 4.4e64) - exercises MandelbrotPerturbation
export const FAVORITE_PERT = {
    center: [
        {bigInt: '4077960720329677970796228048524', scale: 103},
        {bigInt: '-6134635710756172413834769513492', scale: 103},
    ],
    zoom: {bigInt: '4414239926893394470703779991627278029036092206498555513124', scale: 103},
    max_iter: 5000,
}

/**
 * Replicates Fractal._updatePrecision + canvas2complex + task creation from index.js
 * for a full-frame task at pixelSize 1.
 */
export function taskFromView(fxp, view, width, height, smooth = true) {
    let zoom = new fxp.FxP(BigInt(view.zoom.bigInt), view.zoom.scale)
    let center = view.center.map(c => new fxp.FxP(BigInt(c.bigInt), c.scale))
    const requiredPrecision = zoom.multiply(fxp.fromNumber(width).withScale(zoom.scale)).bits() + 5
    const precision = Math.max(58, requiredPrecision)
    zoom = zoom.withScale(precision)
    center = center.map(c => c.withScale(precision))

    const w = fxp.fromNumber(width, precision)
    const h = fxp.fromNumber(height, precision)
    const cscale = zoom.multiply(w).divide(fxp.fromNumber(4, precision))
    const c2c = (x, y) => {
        const r = fxp.fromNumber(x, precision).subtract(w.divide(fxp.fromNumber(2, precision))).divide(cscale)
        const i = fxp.fromNumber(y, precision).subtract(h.divide(fxp.fromNumber(2, precision))).divide(cscale)
        return [r.add(center[0]), i.add(center[1])]
    }
    return {
        type: 'task',
        jobId: 1,
        jobToken: null,
        pixelSize: 1,
        taskNumber: 0,
        xOffset: 0,
        yOffset: 0,
        w: width,
        h: height,
        frameWidth: width,
        frameHeight: height,
        frameTopLeft: c2c(0, 0),
        frameBottomRight: c2c(width, height),
        paramHash: `${view.max_iter}-${smooth}`,
        resetCaches: false,
        skipTopLeft: false,
        smooth: smooth,
        maxIter: view.max_iter,
        precision: precision,
        requiredPrecision: requiredPrecision,
    }
}

export function parseRawTask(fxp, raw) {
    const clone = JSON.parse(JSON.stringify(raw))
    clone.frameTopLeft[0] = fxp.fromJSON(clone.frameTopLeft[0])
    clone.frameTopLeft[1] = fxp.fromJSON(clone.frameTopLeft[1])
    clone.frameBottomRight[0] = fxp.fromJSON(clone.frameBottomRight[0])
    clone.frameBottomRight[1] = fxp.fromJSON(clone.frameBottomRight[1])
    clone.jobToken = null
    return clone
}

/** Runs one full window either as a single task or tiled into squares like production (SQUARE_SIZE=32). */
export async function renderWindow(impl, ctx, task, [x0, y0], [w, h], {tile = 0, jobId = 1} = {}) {
    const values = new Int32Array(w * h)
    const smooth = task.smooth ? new Uint8ClampedArray(w * h) : null
    const tw = tile > 0 ? tile : w
    const th = tile > 0 ? tile : h
    let nTasks = 0
    for (let ty = 0; ty < h; ty += th) {
        for (let tx = 0; tx < w; tx += tw) {
            const t = Object.assign({}, task)
            t.jobId = jobId
            t.xOffset = x0 + tx
            t.yOffset = y0 + ty
            t.w = Math.min(tw, w - tx)
            t.h = Math.min(th, h - ty)
            ctx.initTask(null)
            const res = await impl.process(t)
            nTasks++
            // stitch into the full window buffers
            for (let yy = 0; yy < t.h; yy++) {
                const src = yy * t.w
                const dst = (ty + yy) * w + tx
                values.set(res.values.subarray(src, src + t.w), dst)
                if (smooth) smooth.set(res.smooth.subarray(src, src + t.w), dst)
            }
        }
    }
    return {values, smooth, nTasks}
}

export function summarize(values) {
    // small stable fingerprint: counts + fnv-ish hash
    let hash = 0x811c9dc5
    let interior = 0
    let sum = 0
    for (let i = 0; i < values.length; i++) {
        const v = values[i]
        hash = ((hash ^ (v & 0xff)) * 0x01000193) >>> 0
        hash = ((hash ^ ((v >> 8) & 0xff)) * 0x01000193) >>> 0
        if (v === 2) interior++
        sum += v
    }
    return {hash: hash.toString(16), interior, sum}
}
