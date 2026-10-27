// The AudioWorklet scope supplies these globals; page code never loads this file.
const {AudioWorkletProcessor, registerProcessor} = /** @type {any} */ (globalThis);

class RpmMic extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor('rpm-mic', RpmMic);
