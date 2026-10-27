// AudioWorkletGlobalScope names that the DOM types do not declare.
const {AudioWorkletProcessor,registerProcessor}=globalThis;
class RpmMic extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor('rpm-mic', RpmMic);
