export interface PathPreviewSettings {
  evenoddFill: boolean;
  evenoddClip: boolean;
  nonScalingStroke: boolean;
  fillEnabled: boolean;
  strokeEnabled: boolean;
  fill: string;
  stroke: string;
  fillOpacity: number;
  strokeOpacity: number;
  strokeWidth: number;
  duration: number;
}

interface AnimationSvgOptions {
  paths: string[];
  viewBox: string;
  settings: PathPreviewSettings;
  canMorph: boolean;
  id: string;
}

const escapeAttribute = (value: string | number) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/** Export a self-contained SVG with declarative SMIL hover and focus events. */
export function buildPathAnimationSvg({ paths, viewBox, settings, canMorph, id }: AnimationSvgOptions): string {
  if (!paths.length) throw new Error('Enter valid path data before copying.');

  const attributes: Record<string, string | number> = {
    d: paths[0],
    fill: settings.fillEnabled ? settings.fill : 'none',
    stroke: settings.strokeEnabled ? settings.stroke : 'none',
    'fill-opacity': settings.fillOpacity,
    'stroke-opacity': settings.strokeOpacity,
    'stroke-width': settings.strokeWidth,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  };
  if (settings.evenoddFill) attributes['fill-rule'] = 'evenodd';
  if (settings.evenoddClip) attributes['clip-rule'] = 'evenodd';
  if (settings.nonScalingStroke) attributes['vector-effect'] = 'non-scaling-stroke';
  const pathAttributes = Object.entries(attributes)
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`).join(' ');
  // Keep event identifiers simple so SMIL can resolve them as event bases.
  const eventId = `path${id.replace(/[^A-Za-z0-9_]/g, '')}`;
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" id="${eventId}" viewBox="${escapeAttribute(viewBox)}" width="320" height="320" tabindex="0" role="img" aria-label="Animated SVG path">`,
  ];

  if (paths.length === 1) {
    lines.push(`  <path ${pathAttributes} />`);
  } else {
    const mode = canMorph ? 'linear' : 'discrete';
    lines.push(
      `  <path ${pathAttributes}>`,
      `    <animate attributeName="d" values="${escapeAttribute(paths.join(';'))}" dur="${settings.duration * (paths.length - 1)}s" begin="${eventId}.mouseenter;${eventId}.focusin" end="${eventId}.mouseleave;${eventId}.focusout" fill="freeze" repeatCount="1" calcMode="${mode}" />`,
      // Ending the forward animation freezes its current shape. A to-animation
      // uses that underlying shape, including when the hover is interrupted.
      `    <animate attributeName="d" to="${escapeAttribute(paths[0])}" dur="${settings.duration}s" begin="${eventId}.mouseleave;${eventId}.focusout" end="${eventId}.mouseenter;${eventId}.focusin" fill="freeze" repeatCount="1" calcMode="${mode}" />`,
      '  </path>',
    );
  }
  lines.push('</svg>');
  return lines.join('\n');
}
