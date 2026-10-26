// A save made against an older version fails; the phone's sync can save in between at any moment.
export const changedUnderneath = error => error?.code === 'VERSION_CONFLICT'
  || /Saved (?:context|data) changed|Version conflict/i.test(error?.message ?? ''); // rules-allow raw-error-text: classify CAS failures only

export async function retryOnChange(run, reload, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try { return await run(); }
    catch (error) {
      if (attempt >= attempts || !changedUnderneath(error)) throw error;
      await reload();
    }
  }
}
