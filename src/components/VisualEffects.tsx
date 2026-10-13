import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * Genuine ISO/IEC 18004 Scannable QR Code Component
 * Works with any iOS / Android native camera app!
 */
export const RoomQrBadge: React.FC<{ value: string; code: string; size?: number }> = ({
  value,
  code,
  size = 160,
}) => {
  const [svgDataUrl, setSvgDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: size * 2,
      color: {
        dark: '#07080d',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (active) setSvgDataUrl(url);
      })
      .catch((err) => {
        console.error('QR generation failed:', err);
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!svgDataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className="rounded-xl bg-white flex items-center justify-center text-xs font-mono text-slate-600"
      >
        {code}
      </div>
    );
  }

  return (
    <img
      src={svgDataUrl}
      alt={`Scan QR to join Room ${code}`}
      width={size}
      height={size}
      className="rounded-xl bg-white block select-none"
    />
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
