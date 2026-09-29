import type { Pose, RigDef } from '../content/types.ts';
import { stateProgress, type Hazard } from '../entities/boss.ts';
import type { Enemy } from '../entities/enemies.ts';
import { rect, type Ctx } from './draw.ts';
import { blendPose, drawRig, samplePose } from './skeleton.ts';
import { drawIce } from './sprites.ts';

/** Seconds to cross-fade from one clip to the next. */
const BLEND = 0.12;

/** Which clip plays: "<move>_<state>" while attacking, else idle, walk or air. */
export function clipFor(e: Enemy, rig: RigDef): string {
  const b = e.boss!;
  if (e.state === 'transition') return 'transition';
  if (e.state === 'wind' || e.state === 'strike' || e.state === 'recover') {
    const named = `${b.move}_${e.state}`;
    if (rig.clips[named]) return named;
    if (e.state === 'recover' && rig.clips.recover) return 'recover';
  }
  if (!e.ground && rig.clips.air) return 'air';
  return Math.abs(e.vx) > 5 && rig.clips.walk ? 'walk' : 'idle';
}

interface Track {
  clip: string;
  from: Pose;
  last: Pose;
  since: number;
}

/** Keeps each boss's current clip so clip changes blend instead of snapping. */
export class BossAnimator {
  private tracks = new WeakMap<Enemy, Track>();

  pose(e: Enemy, rig: RigDef, time: number): Pose {
    const name = clipFor(e, rig);
    const clip = rig.clips[name] ?? rig.clips.idle;
    const t = clip.loop ? (time / (clip.duration ?? 1)) % 1 : stateProgress(e);
    let pose = samplePose(clip, t);
    let track = this.tracks.get(e);
    if (!track) this.tracks.set(e, (track = { clip: name, from: pose, last: pose, since: time }));
    if (track.clip !== name) Object.assign(track, { clip: name, from: track.last, since: time });
    const k = Math.min(1, (time - track.since) / BLEND);
    if (k < 1) pose = blendPose(track.from, pose, k);
    track.last = pose;
    return pose;
  }

  draw(ctx: Ctx, e: Enemy, rig: RigDef, time: number): void {
    const pose = { ...this.pose(e, rig, time) };
    // Roaring or calling help: the whole body trembles.
    if (e.state === 'transition') pose.rootX = (pose.rootX ?? 0) + Math.sin(time * 45) * 2;
    drawRig(ctx, rig, pose, { x: e.x + e.w / 2, y: e.y + e.h, face: e.face, time, hit: e.hit > 0, phase: e.boss!.phase + 1 });
    if (e.state === 'strike' && e.boss!.move === 'slash' && stateProgress(e) < 0.5) {
      ctx.strokeStyle = '#ecc692';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(e.x + e.w / 2, e.y + 36, 95, e.face > 0 ? -1.1 : 2, e.face > 0 ? 1.1 : 4.2);
      ctx.stroke();
    }
    if (e.frozen > 0) drawIce(ctx, e);
  }
}

/** Pillars and beams: a flickering warning first, then the real thing. */
export function drawHazard(ctx: Ctx, h: Hazard, time: number): void {
  if (h.delay > 0) {
    ctx.globalAlpha = 0.35 + Math.sin(time * 30) * 0.2;
    if (h.kind === 'pillar') {
      rect(ctx, h.x - 2, h.y + h.h - 4, h.w + 4, 4, '#bfe6ff');
      for (let i = 0; i < 3; i++) rect(ctx, h.x + 4 + i * 8, h.y + h.h - 10 - (i % 2) * 4, 2, 6 + (i % 2) * 4, '#8fd0e0');
    } else rect(ctx, h.x, h.y + h.h / 2 - 1, h.w, 2, '#bfe6ff');
    ctx.globalAlpha = 1;
    return;
  }
  if (h.kind === 'pillar') {
    // Rises quickly, then holds.
    const grow = Math.min(1, (h.max - h.life) / 0.08);
    const height = h.h * grow;
    const top = h.y + h.h - height;
    ctx.fillStyle = '#6fa9c2';
    ctx.beginPath();
    ctx.moveTo(h.x, h.y + h.h);
    ctx.lineTo(h.x + h.w / 2, top);
    ctx.lineTo(h.x + h.w, h.y + h.h);
    ctx.fill();
    ctx.fillStyle = '#d7f4fb';
    ctx.beginPath();
    ctx.moveTo(h.x + h.w / 2 - 3, h.y + h.h);
    ctx.lineTo(h.x + h.w / 2, top + 6);
    ctx.lineTo(h.x + h.w / 2 + 3, h.y + h.h);
    ctx.fill();
    return;
  }
  ctx.globalAlpha = 0.85;
  rect(ctx, h.x, h.y, h.w, h.h, '#8fd0e0');
  ctx.globalAlpha = 1;
  rect(ctx, h.x, h.y + h.h / 2 - 3, h.w, 6, '#f2fbff');
}
