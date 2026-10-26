const Module = require('node:module');
const load = Module._load;
// Convex 1.45 stats metafile input keys as paths, including esbuild's JSON attribute suffix.
Module._load = function(name, ...args) {
  const target = load.call(this, name, ...args);
  if (name !== 'esbuild') return target;
  return new Proxy(target, {get(object, key) {
    if (key !== 'build') return object[key];
    return async options => {
      const result = await object.build(options);
      if (result.metafile) result.metafile.inputs = Object.fromEntries(Object.entries(result.metafile.inputs)
        .map(([path, input]) => [path.replace(/\.json with \{ type: ['"]json['"] \}$/, '.json'), input]));
      return result;
    };
  }});
};
