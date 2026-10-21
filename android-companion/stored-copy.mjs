export function storedCopy(native) {
  let copy = null;
  return {
    async load() {
      const latest = await native('load', copy ? {known: copy.version} : {});
      if (!latest.unchanged) copy = latest.data ?? null;
      return {phone: latest.phone, data: copy && structuredClone(copy)};
    },
    remember(data) { copy = structuredClone(data); },
  };
}
