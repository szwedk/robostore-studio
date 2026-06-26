/**
 * Tiny PCA → 2D for the classifier scatter. Centers the data, builds the
 * covariance matrix, and extracts the top-2 eigenvectors via cyclic Jacobi
 * rotation (the matrix is small and symmetric). No dependencies.
 */
export interface Projected {
  points: { x: number; y: number }[];
  explained: [number, number];
}

function jacobiEigen(a: number[][], iters = 60): { values: number[]; vectors: number[][] } {
  const n = a.length;
  const v: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
  const m = a.map((r) => [...r]);
  for (let sweep = 0; sweep < iters; sweep++) {
    let off = 0;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) off += m[p][q] ** 2;
    if (off < 1e-12) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(m[p][q]) < 1e-14) continue;
        const theta = (m[q][q] - m[p][p]) / (2 * m[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let i = 0; i < n; i++) {
          const mip = m[i][p];
          const miq = m[i][q];
          m[i][p] = c * mip - s * miq;
          m[i][q] = s * mip + c * miq;
        }
        for (let i = 0; i < n; i++) {
          const mpi = m[p][i];
          const mqi = m[q][i];
          m[p][i] = c * mpi - s * mqi;
          m[q][i] = s * mpi + c * mqi;
        }
        for (let i = 0; i < n; i++) {
          const vip = v[i][p];
          const viq = v[i][q];
          v[i][p] = c * vip - s * viq;
          v[i][q] = s * vip + c * viq;
        }
      }
    }
  }
  const values = m.map((_, i) => m[i][i]);
  return { values, vectors: v };
}

export function pca2d(rows: number[][]): Projected {
  const n = rows.length;
  const d = rows[0]?.length ?? 0;
  if (n < 2 || d < 2) return { points: rows.map(() => ({ x: 0, y: 0 })), explained: [0, 0] };

  const mean = Array(d).fill(0);
  for (const r of rows) for (let j = 0; j < d; j++) mean[j] += r[j] / n;
  const centered = rows.map((r) => r.map((v, j) => v - mean[j]));

  const cov: number[][] = Array.from({ length: d }, () => Array(d).fill(0));
  for (const r of centered)
    for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) cov[i][j] += (r[i] * r[j]) / (n - 1);

  const { values, vectors } = jacobiEigen(cov);
  const order = values.map((val, i) => [val, i] as [number, number]).sort((a, b) => b[0] - a[0]);
  const [i0, i1] = [order[0][1], order[1][1]];
  const axis0 = vectors.map((row) => row[i0]);
  const axis1 = vectors.map((row) => row[i1]);

  const points = centered.map((r) => ({
    x: r.reduce((s, v, j) => s + v * axis0[j], 0),
    y: r.reduce((s, v, j) => s + v * axis1[j], 0),
  }));
  const totalVar = values.reduce((s, v) => s + Math.max(0, v), 0) || 1;
  return {
    points,
    explained: [Math.max(0, order[0][0]) / totalVar, Math.max(0, order[1][0]) / totalVar],
  };
}
