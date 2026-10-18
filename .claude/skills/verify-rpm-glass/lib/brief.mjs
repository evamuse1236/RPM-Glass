export function briefUi(snapshot) {
  return (snapshot.elements ?? snapshot.nodes ?? []).map(element => {
    const role = element.role ?? element.cls ?? 'generic';
    const name = element.name ?? (element.text || element.desc || element.id || '');
    const state = element.state ?? (element.clickable ? {clickable: true} : {});
    const entries = Object.entries(state).map(([key, value]) =>
      `${key}=${['true', 'false'].includes(String(value)) ? value : JSON.stringify(value)}`);
    return `${role} ${JSON.stringify(name)}${entries.length ? ` [${entries.join(', ')}]` : ''}${element.inView === false ? ' (off-screen)' : ''}`;
  }).join('\n');
}
