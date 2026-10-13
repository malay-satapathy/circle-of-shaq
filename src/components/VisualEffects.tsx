import React, { useMemo } from 'react';

/**
 * Lightweight deterministic QR-style Room Invite Matrix SVG
 * Renders a crisp, scannable-looking visual badge + room code with zero external dependencies.
 */
export const RoomQrBadge: React.FC<{ value: string; code: string; size?: number }> = ({
  value,
  code,
  size = 160,
}) => {
  const grid = useMemo(() => {
    const dim = 15;
    const cells: boolean[][] = Array.from({ length: dim }, () => Array(dim).fill(false));

    // Draw standard QR finder patterns in 3 corners
    const drawFinder = (r0: number, c0: number) => {
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          const isBorder = r === 0 || r === 4 || c === 0 || c === 4;
          const isCenter = r === 2 && c === 2;
          cells[r0 + r][c0 + c] = isBorder || isCenter;
        }
      }
    };
    drawFinder(0, 0);
    drawFinder(0, dim - 5);
    drawFinder(dim - 5, 0);

    // Deterministic hash from value + code for interior modules
    let hash = 2166136261;
    const str = `${value}:${code}`;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    for (let r = 0; r < dim; r++) {
      for (let c = 0; c < dim; c++) {
        const inTopLeft = r < 6 && c < 6;
        const inTopRight = r < 6 && c >= dim - 6;
        const inBottomLeft = r >= dim - 6 && c < 6;
        if (inTopLeft || inTopRight || inBottomLeft) continue;
        hash ^= (r * 31 + c * 17) & 0xff;
        hash = Math.imul(hash, 16777619);
        cells[r][c] = (Math.abs(hash) % 10) < 5;
      }
    }
    return cells;
  }, [value, code]);

  const dim = grid.length;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${dim + 2} ${dim + 2}`}
      className="rounded-xl bg-white p-1 shadow-inner"
      aria-label={`Invite Matrix for Room ${code}`}
    >
      <rect width={dim + 2} height={dim + 2} fill="#ffffff" rx={1} />
      {grid.map((row, r) =>
        row.map((filled, c) =>
          filled ? (
            <rect
              key={`${r}-${c}`}
              x={c + 1}
              y={r + 1}
              width={0.9}
              height={0.9}
              rx={0.18}
              fill="#0f172a"
            />
          ) : null
        )
      )}
    </svg>
  );
};

/**
 * Native HTML5 Canvas Confetti Burst for the Winners Podium!
 */
export const ConfettiCanvas: React.FC = () => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#f43f5e', '#eab308', '#10b981', '#38bdf8', '#a855f7', '#fb923c'];
    const particles = Array.from({ length: 110 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: 6 + Math.random() * 8,
      h: 6 + Math.random() * 6,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 4,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.15,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    let animId: number;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;
        if (p.y > canvas.height + 20) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      animId = requestAnimationFrame(render);
    };
    animId = requestAnimationFrame(render);

    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-20"
    />
  );
};
