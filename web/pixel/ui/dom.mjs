/** h('button.key.filled', {onclick, 'aria-label': 'Send'}, 'Send'): one element with classes, props and children. */
export function h(spec, props = {}, ...children) {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [name, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
    else if (name === 'dataset') {
      for (const [k, v] of Object.entries(value)) if (v != null && v !== false) node.dataset[k] = v;
    }
    else if (name === 'html') node.innerHTML = value;
    else if (name in node && typeof value !== 'string') node[name] = value;
    else node.setAttribute(name, value === true ? '' : value);
  }
  node.append(...children.flat(Infinity).filter(c => c != null && c !== false));
  return node;
}

/** A key: the chunky pixel button. `hint` is the keyboard letter drawn as an inverse cap. */
export function key(label, onclick, {cls = '', hint = null, aria = null, disabled = false, type = 'button'} = {}) {
  return h(`button.key${cls ? '.' + cls.split(' ').join('.') : ''}`, {type, onclick, disabled, 'aria-label': aria},
    hint ? h('kbd.cap', {'aria-hidden': 'true'}, hint) : null, label);
}

/** Replace a node's children, skipping the nulls and falses that conditional parts leave. */
export const fill = (node, ...children) => node.replaceChildren(...children.flat(Infinity).filter(c => c != null && c !== false));

export const text = (spec, value, props) => h(spec, props, value);
