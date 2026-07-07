'use client';

import { useEffect, useRef } from 'react';
import { Button } from '../ui/Button';

interface Star {
  x: number;
  y: number;
  size: number;
  baseSpeedY: number;
  opacity: number;
  pulseSpeed: number;
  pulsePhase: number;
}

export function Hero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Generate stars/particles
    const starCount = 60;
    const stars: Star[] = [];
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 1.5 + 0.4, // 0.4px to 1.9px
        baseSpeedY: -(Math.random() * 0.12 + 0.04), // Drift slowly upwards
        opacity: Math.random() * 0.5 + 0.15, // 0.15 to 0.65
        pulseSpeed: Math.random() * 0.015 + 0.005,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      // Offset mouse coordinates around center to create parallax
      mouseRef.current.targetX = (e.clientX - window.innerWidth / 2) * 0.04;
      mouseRef.current.targetY = (e.clientY - window.innerHeight / 2) * 0.04;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);

    const animate = () => {
      // Interpolate mouse movements smoothly (lerp)
      const mouse = mouseRef.current;
      mouse.x += (mouse.targetX - mouse.x) * 0.05;
      mouse.y += (mouse.targetY - mouse.y) * 0.05;

      ctx.clearRect(0, 0, width, height);

      stars.forEach((star) => {
        // Drift position upwards
        star.y += star.baseSpeedY;

        // Wrap around when leaving screen
        if (star.y < -10) {
          star.y = height + 10;
          star.x = Math.random() * width;
        }

        // Pulse star opacity organically
        star.pulsePhase += star.pulseSpeed;
        const currentOpacity = star.opacity + Math.sin(star.pulsePhase) * 0.12;
        const clampedOpacity = Math.max(0.1, Math.min(0.75, currentOpacity));

        // Parallax offset proportional to star size (adds depth)
        const renderX = star.x - mouse.x * (star.size * 0.6);
        const renderY = star.y - mouse.y * (star.size * 0.6);

        // Draw star
        ctx.beginPath();
        ctx.arc(renderX, renderY, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${clampedOpacity})`;
        // Only larger stars get a soft bloom/shadow
        if (star.size > 1.3) {
          ctx.shadowBlur = 3;
          ctx.shadowColor = '#ffffff';
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.fill();
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center pt-20 overflow-hidden bg-gradient-to-br from-[#00213d] via-[#00172B] to-black">
      {/* Space Background HTML5 Canvas */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 w-full h-full z-0 pointer-events-none opacity-80"
      />

      {/* Decorative gradient blob for depth */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-25 bg-[radial-gradient(circle_at_center,rgba(255,45,0,0.15)_0%,transparent_55%)]" />

      {/* Content */}
      <div className="relative z-10 max-w-[1440px] px-6 mx-auto w-full flex flex-col items-center text-center">
        {/* Headings */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[4.5rem] leading-[1.1] font-bold text-white max-w-4xl tracking-tight mb-6">
          Convertimos visiones complejas en{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">
            infraestructura digital robusta.
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-white/70 max-w-2xl font-light mb-12">
          Desarrollo Web, Mobile Apps y Ciberseguridad con estándar global.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Button variant="primary" size="lg">
            Solicitar Diagnóstico Inicial
          </Button>
          <Button variant="outline" size="lg">
            Conocer Metodología
          </Button>
        </div>
      </div>
    </section>
  );
}
