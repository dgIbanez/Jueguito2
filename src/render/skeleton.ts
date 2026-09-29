/**
 * 2D skeletal animation: bones rotate relative to their parent, poses are
 * sampled from keyframed clips (data/rigs.json) and blended when the clip
 * changes. Parts are simple shapes today; a part could become an image later
 * without touching the animation.
 */
import type { Pose, RigBone, RigClip, RigDef, RigPart } from '../content/types.ts';
import type { Ctx } from './draw.ts';

/** Neutral value of a pose channel when no key mentions it. */
const neutral = (channel: string): number => (channel === 'scaleX' || channel === 'scaleY' ? 1 : channel === 'glow' ? -1 : 0);

const lerp = (a: number, b: number, f: number): number => a + (b - a) * f;

/** Smoothstep easing between keyframes: gestures accelerate and settle. */
const ease = (f: number): number => f * f * (3 - 2 * f);

/** Samples a clip at progress t (0-1). Keyframe values override the clip's base. */
export function samplePose(clip: RigClip, t: number): Pose {
  const keys = clip.keys;
  const base = clip.base ?? {};
  const time = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= time) i++;
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  const f = b.t > a.t ? ease((time - a.t) / (b.t - a.t)) : 0;
  const pose: Pose = { ...base };
  for (const channel of new Set([...Object.keys(a.pose), ...Object.keys(b.pose)])) {
    const from = a.pose[channel] ?? base[channel] ?? neutral(channel);
    const to = b.pose[channel] ?? base[channel] ?? neutral(channel);
    pose[channel] = lerp(from, to, f);
  }
  return pose;
}

/** Linear blend between two poses (used to cross-fade clips). */
export function blendPose(from: Pose, to: Pose, f: number): Pose {
  const pose: Pose = {};
  for (const channel of new Set([...Object.keys(from), ...Object.keys(to)])) pose[channel] = lerp(from[channel] ?? neutral(channel), to[channel] ?? neutral(channel), f);
  return pose;
}

export interface RigDrawOptions {
  x: number;
  y: number;
  face: number;
  time: number;
  /** Flash every part white while hit. */
  hit: boolean;
  /** Boss phase (1-based) for phase-gated parts. */
  phase: number;
}

function drawPart(ctx: Ctx, part: RigPart, color: string): void {
  ctx.fillStyle = color;
  if (part.shape === 'rect') ctx.fillRect(part.x ?? 0, part.y ?? 0, part.w ?? 0, part.h ?? 0);
  else if (part.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(part.x ?? 0, part.y ?? 0, part.r ?? 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (part.points?.length) {
    ctx.beginPath();
    ctx.moveTo(part.points[0][0], part.points[0][1]);
    for (const [px, py] of part.points.slice(1)) ctx.lineTo(px, py);
    ctx.closePath();
    ctx.fill();
  }
}

/** Forward kinematics: each bone's transform is its parent's, moved and rotated. */
export function drawRig(ctx: Ctx, rig: RigDef, pose: Pose, o: RigDrawOptions): void {
  const val = (channel: string) => pose[channel] ?? neutral(channel);
  ctx.save();
  ctx.translate(o.x + val('rootX') * o.face, o.y + val('rootY'));
  ctx.scale(o.face, 1);
  const rot = val('rootRot');
  if (rot) {
    const [cx, cy] = rig.center;
    ctx.translate(cx, cy);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  ctx.scale(val('scaleX'), val('scaleY'));
  const root = ctx.getTransform();

  const byId = new Map(rig.bones.map((b) => [b.id, b]));
  const world = new Map<string, DOMMatrix>();
  const resolve = (bone: RigBone): DOMMatrix => {
    const cached = world.get(bone.id);
    if (cached) return cached;
    const parent = bone.parent ? byId.get(bone.parent) : undefined;
    const m = (parent ? resolve(parent) : root).translate(bone.x, bone.y).rotate(val(bone.id));
    world.set(bone.id, m);
    return m;
  };

  const glowValue = val('glow') >= 0 ? val('glow') : 0.6 + Math.sin(o.time * 4) * 0.3;
  for (const bone of [...rig.bones].sort((a, b) => (a.z ?? 0) - (b.z ?? 0))) {
    if (val(`hide_${bone.id}`) > 0.5) continue;
    ctx.setTransform(resolve(bone));
    for (const part of bone.parts) {
      if (part.phase && o.phase < part.phase) continue;
      ctx.globalAlpha = part.glow ? Math.max(0.25, Math.min(1, glowValue)) : 1;
      drawPart(ctx, part, o.hit && !part.glow ? '#fff0ca' : part.color);
    }
  }
  ctx.restore();
}
