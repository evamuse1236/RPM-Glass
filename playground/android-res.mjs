const attr = (xml, name) => xml.match(new RegExp(`android:${name}="([^"]*)"`))?.[1];

export function vectorToMaskSvg(xml) {
  const w = attr(xml, 'viewportWidth'), h = attr(xml, 'viewportHeight');
  const paths = [...xml.matchAll(/<path\b[^>]*>/g)].map(([tag]) => {
    const fill = attr(tag, 'fillColor'), stroke = attr(tag, 'strokeColor');
    const filled = fill && !fill.includes('transparent');
    const parts = [`d="${attr(tag, 'pathData')}"`, `fill="${filled ? '#000' : 'none'}"`];
    if (stroke) parts.push('stroke="#000"', `stroke-width="${attr(tag, 'strokeWidth') ?? 1}"`,
      `stroke-linecap="${attr(tag, 'strokeLineCap') ?? 'butt'}"`, `stroke-linejoin="${attr(tag, 'strokeLineJoin') ?? 'miter'}"`);
    return `<path ${parts.join(' ')}/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${paths.join('')}</svg>`;
}

const argb = hex => {
  const h = hex.slice(1);
  if (h.length !== 8) return '#' + h;
  const byte = i => parseInt(h.slice(i, i + 2), 16);
  return `rgb(${byte(2)} ${byte(4)} ${byte(6)} / ${(byte(0) / 255).toFixed(3)})`;
};
const colors = xml => new Map([...xml.matchAll(/<color name="([^"]+)">([^<]+)<\/color>/g)].map(m => [m[1], argb(m[2].trim())]));

export function colorsToCss(lightXml, darkXml) {
  const light = colors(lightXml), dark = colors(darkXml);
  const rules = [...light].map(([name, value]) => `  --${name.replaceAll('_', '-')}: light-dark(${value}, ${dark.get(name) ?? value});`);
  return `:root {\n${rules.join('\n')}\n}\n`;
}
