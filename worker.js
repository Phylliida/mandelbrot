/**
 * @author Bert Baron
 */
import * as fxp from './fxp.mjs'
import {WorkerContext} from "./workerContext.mjs";
import {MandelbrotFloat} from "./mandelbrotFloat.mjs";
import {MandelbrotFxP} from "./mandelbrotFxP.mjs";
import {MandelbrotPerturbation} from "./mandelbrotPerturbation.mjs";
import {MandelbrotPerturbationExtFloat} from "./mandelbrotPerturbationExtFloat.mjs";
import {MandelbrotMirage} from "./mandelbrotMirage.mjs";
import {MandelbrotMiragePerturbation} from "./mandelbrotMiragePerturbation.mjs";
import {MandelbrotWebGPU} from "./mandelbrotWebGPU.mjs";

const ctx = new WorkerContext()

async function initMandelbrotFloat() {
    await new Promise(resolve => setTimeout(resolve, 1))
    return new MandelbrotFloat(ctx)
}

async function initMandelbrotFxP() {
    await new Promise(resolve => setTimeout(resolve, 1))
    return new MandelbrotFxP(ctx)
}

async function initMandelbrotPerturbation() {
    await new Promise(resolve => setTimeout(resolve, 1))
    return new MandelbrotPerturbation(ctx)
}

async function initMandelbrotPerturbationExtFloat() {
    await new Promise(resolve => setTimeout(resolve, 1))
    return new MandelbrotPerturbationExtFloat(ctx)
}

async function initMandelbrotMirage() {
    await new Promise(resolve => setTimeout(resolve, 1))
    return new MandelbrotMirage(ctx)
}

async function initMandelbrotMiragePerturbation() {
    await new Promise(resolve => setTimeout(resolve, 1))
    return new MandelbrotMiragePerturbation(ctx)
}

const mandelbrotFloat = initMandelbrotFloat();
const mandelbrotFxP = initMandelbrotFxP();
const mandelbrotPerturbation = initMandelbrotPerturbation();
const mandelbrotPerturbationExtFloat = initMandelbrotPerturbationExtFloat();
const mandelbrotMirage = initMandelbrotMirage();
const mandelbrotMiragePerturbation = initMandelbrotMiragePerturbation();

onmessage = handleMessage

// Add some randomnes to have different checkpoints per worker
const STOP_CHECK_INTERVAL = 200 + Math.floor(Math.random() * 100)

async function handleMessage(msg) {
    const message = parseMessage(msg)
    // console.log(`Received: ${JSON.stringify(msg.data)}`)

    if (message.type === 'task') {
        const implPromise =
            message.fractal === 'mirage'
                ? (message.requiredPrecision > 58 ? mandelbrotMiragePerturbation : mandelbrotMirage)
                : message.requiredPrecision > 1020
                    ? mandelbrotPerturbationExtFloat
                    : message.requiredPrecision > 58
                        ? mandelbrotPerturbation
                        : mandelbrotFloat

        const impl = await implPromise
        // console.log(`Precision ${message.requiredPrecision}, using ${impl.constructor.name}`)


        ctx.initTask(message.jobToken)
        ctx.resetStats()
        const result = await impl.process(message)
        // Transfer the pixel buffers instead of copying them, they are not used here anymore
        const transfer = [result.values.buffer]
        if (result.smooth) {
            transfer.push(result.smooth.buffer)
        }
        postMessage(result, transfer)
    }
}

function parseMessage(msg) {
    if (msg.data.type === 'task') {
        msg.data.frameTopLeft[0] = fxp.fromJSON(msg.data.frameTopLeft[0])
        msg.data.frameTopLeft[1] = fxp.fromJSON(msg.data.frameTopLeft[1])
        msg.data.frameBottomRight[0] = fxp.fromJSON(msg.data.frameBottomRight[0])
        msg.data.frameBottomRight[1] = fxp.fromJSON(msg.data.frameBottomRight[1])
    }
    return msg.data
}
