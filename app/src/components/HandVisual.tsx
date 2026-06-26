import { useMemo } from "react";
import type { TouchSample } from "@/lib/protocol";

interface Props {
  positions: number[]; // [thumb, thumb_aux, index, middle, ring, pinky] 0..1000
  touch: TouchSample[]; // [thumb, index, middle, ring, pinky]
  forceWarn: number;
  forceHigh: number;
}

const RAD = Math.PI / 180;
const vec = (deg: number): [number, number] => [Math.sin(deg * RAD), -Math.cos(deg * RAD)];

interface Finger {
  baseX: number;
  baseY: number;
  len: number;
  baseAngle: number;
  posIdx: number;
  touchIdx: number;
  width: number;
}

// Right hand, back view. Four uprights + an opposable thumb.
const FINGERS: Finger[] = [
  { baseX: 104, baseY: 160, len: 96, baseAngle: -7, posIdx: 2, touchIdx: 1, width: 19 },
  { baseX: 134, baseY: 150, len: 112, baseAngle: -2, posIdx: 3, touchIdx: 2, width: 20 },
  { baseX: 165, baseY: 158, len: 100, baseAngle: 4, posIdx: 4, touchIdx: 3, width: 19 },
  { baseX: 193, baseY: 172, len: 78, baseAngle: 11, posIdx: 5, touchIdx: 4, width: 16 },
];

function fingerPath(f: Finger, curl: number) {
  const proxLen = f.len * 0.52;
  const distLen = f.len * 0.48;
  const a1 = f.baseAngle + curl * 55;
  const a2 = a1 + curl * 100;
  const p0: [number, number] = [f.baseX, f.baseY];
  const d1 = vec(a1);
  const p1: [number, number] = [p0[0] + d1[0] * proxLen, p0[1] + d1[1] * proxLen];
  const d2 = vec(a2);
  const p2: [number, number] = [p1[0] + d2[0] * distLen, p1[1] + d2[1] * distLen];
  return { p0, p1, p2, d: `M${p0[0]},${p0[1]} L${p1[0]},${p1[1]} L${p2[0]},${p2[1]}` };
}

function thumbPath(curl: number, abduct: number) {
  // abduct: 0 = splayed out, 1 = tucked toward palm
  const base: [number, number] = [80, 212];
  const baseAngle = -74 + abduct * 34;
  const proxLen = 44;
  const distLen = 38;
  const a1 = baseAngle + curl * 42;
  const a2 = a1 + curl * 66;
  const d1 = vec(a1);
  const p1: [number, number] = [base[0] + d1[0] * proxLen, base[1] + d1[1] * proxLen];
  const d2 = vec(a2);
  const p2: [number, number] = [p1[0] + d2[0] * distLen, p1[1] + d2[1] * distLen];
  return { p0: base, p1, p2, d: `M${base[0]},${base[1]} L${p1[0]},${p1[1]} L${p2[0]},${p2[1]}` };
}

function tipColor(sample: TouchSample | undefined, warn: number, high: number) {
  if (!sample || sample.normal < 1) return "rgb(var(--surface-3))";
  if (sample.normal >= high) return "rgb(var(--red))";
  if (sample.normal >= warn) return "rgb(var(--amber))";
  return "rgb(var(--green))";
}

export function HandVisual({ positions, touch, forceWarn, forceHigh }: Props) {
  const fingers = useMemo(
    () => FINGERS.map((f) => ({ f, geo: fingerPath(f, (positions[f.posIdx] ?? 0) / 1000) })),
    [positions],
  );
  const thumb = useMemo(
    () => thumbPath((positions[0] ?? 0) / 1000, (positions[1] ?? 0) / 1000),
    [positions],
  );

  return (
    <svg viewBox="0 0 280 320" className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgb(var(--surface-3))" />
          <stop offset="1" stopColor="rgb(var(--surface-2))" />
        </linearGradient>
        <linearGradient id="palmGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgb(var(--surface-3))" />
          <stop offset="1" stopColor="rgb(var(--surface))" />
        </linearGradient>
        <filter id="tipGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>

      {/* wrist + palm */}
      <path
        d="M96,300 L96,250 Q96,236 110,234 L176,234 Q190,236 190,250 L190,300 Z"
        fill="url(#palmGrad)"
        stroke="rgb(var(--line) / 0.14)"
        strokeWidth="1.5"
      />
      <path
        d="M74,214 Q66,150 96,150 L200,150 Q214,150 214,176 L214,238 Q214,262 188,262 L104,262 Q78,262 74,238 Z"
        fill="url(#palmGrad)"
        stroke="rgb(var(--line) / 0.16)"
        strokeWidth="1.5"
      />

      {/* thumb (drawn first so uprights overlap its base) */}
      <FingerStroke
        d={thumb.d}
        width={20}
        joints={[thumb.p1]}
        tip={thumb.p2}
        tipColor={tipColor(touch[0], forceWarn, forceHigh)}
        active={(touch[0]?.status ?? 0) > 0}
      />

      {fingers.map(({ f, geo }) => (
        <FingerStroke
          key={f.posIdx}
          d={geo.d}
          width={f.width}
          joints={[geo.p1]}
          tip={geo.p2}
          tipColor={tipColor(touch[f.touchIdx], forceWarn, forceHigh)}
          active={(touch[f.touchIdx]?.status ?? 0) > 0}
        />
      ))}
    </svg>
  );
}

function FingerStroke({
  d,
  width,
  joints,
  tip,
  tipColor,
  active,
}: {
  d: string;
  width: number;
  joints: [number, number][];
  tip: [number, number];
  tipColor: string;
  active: boolean;
}) {
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke="url(#metal)"
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transition: "all 0.12s linear" }}
      />
      <path
        d={d}
        fill="none"
        stroke="rgb(var(--line) / 0.16)"
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.5}
        style={{ transition: "all 0.12s linear" }}
      />
      {joints.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={width * 0.28} fill="rgb(var(--line) / 0.12)" />
      ))}
      {active && (
        <circle cx={tip[0]} cy={tip[1]} r={width * 0.7} fill={tipColor} filter="url(#tipGlow)" opacity={0.55} />
      )}
      <circle
        cx={tip[0]}
        cy={tip[1]}
        r={width * 0.42}
        fill={tipColor}
        stroke="rgb(var(--bg) / 0.5)"
        strokeWidth="1"
        style={{ transition: "fill 0.15s linear" }}
      />
    </g>
  );
}
