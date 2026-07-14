'use client';

import { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  size: number;
  baseSpeedY: number;
  opacity: number;
  pulseSpeed: number;
  pulsePhase: number;
  isSparkling?: boolean;
}

interface Meteor {
  x: number;
  y: number;
  length: number;
  speed: number;
  angle: number;
  opacity: number;
  active: boolean;
}

export function SpaceBackground() {
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
      // Make exactly 6 stars sparkle/shimmer with elegant cross lens flares
      const isSparkling = i < 6;
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        // Sparkling stars are made larger (2.0px to 2.8px) so they are clearly visible
        size: isSparkling ? Math.random() * 0.8 + 2.0 : Math.random() * 1.5 + 0.4,
        baseSpeedY: -(Math.random() * 0.12 + 0.04), // Drift slowly upwards
        opacity: isSparkling ? Math.random() * 0.4 + 0.45 : Math.random() * 0.5 + 0.15, // Sparkling stars are brighter
        pulseSpeed: isSparkling ? Math.random() * 0.035 + 0.02 : Math.random() * 0.015 + 0.005, // Sparkle/pulse faster
        pulsePhase: Math.random() * Math.PI * 2,
        isSparkling,
      });
    }

    // Meteors collection
    const meteors: Meteor[] = [];

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

      // Draw and update stars
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

        // Draw star core
        ctx.beginPath();
        ctx.arc(renderX, renderY, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${clampedOpacity})`;
        // Only larger stars get a soft bloom/shadow
        if (star.size > 1.3 && !star.isSparkling) {
          ctx.shadowBlur = 3;
          ctx.shadowColor = '#ffffff';
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.fill();

        // Draw a double-sized (star.size * 7), highly distinct 4-point cross flare around sparkling stars
        if (star.isSparkling) {
          ctx.save();
          ctx.beginPath();
          ctx.strokeStyle = `rgba(255, 255, 255, ${clampedOpacity * 0.6})`;
          ctx.lineWidth = 0.5;
          // Horizontal line - length factor is 7x star.size (twice the previous size)
          ctx.moveTo(renderX - star.size * 7, renderY);
          ctx.lineTo(renderX + star.size * 7, renderY);
          // Vertical line - length factor is 7x star.size
          ctx.moveTo(renderX, renderY - star.size * 7);
          ctx.lineTo(renderX, renderY + star.size * 7);
          ctx.stroke();
          ctx.restore();
        }
      });

      // Spawn new meteors occasionally (~1 meteor every ~8-15 seconds at 60fps)
      if (Math.random() < 0.0025 && meteors.filter((m) => m.active).length < 2) {
        // Spawn from top or right edges
        const startFromTop = Math.random() > 0.4;
        meteors.push({
          x: startFromTop ? Math.random() * width * 0.8 + width * 0.2 : width + 10,
          y: startFromTop ? -10 : Math.random() * height * 0.4,
          length: Math.random() * 60 + 40, // 40px to 100px length
          speed: Math.random() * 6 + 7, // 7px to 13px per frame
          angle: Math.PI * 0.78, // diagonal down-left
          opacity: 0.8,
          active: true,
        });
      }

      // Draw and update active meteors
      meteors.forEach((meteor) => {
        if (!meteor.active) return;

        // Move meteor along angle
        const dx = Math.cos(meteor.angle) * meteor.speed;
        const dy = Math.sin(meteor.angle) * meteor.speed;
        meteor.x += dx;
        meteor.y += dy;

        // Fade opacity slightly as it moves
        meteor.opacity -= 0.008;

        // Check bounds or fade out
        if (meteor.opacity <= 0 || meteor.y > height + 20 || meteor.x < -20) {
          meteor.active = false;
          return;
        }

        // Parallax offset (meteors are far away but react to mouse)
        const renderX = meteor.x - mouse.x * 0.5;
        const renderY = meteor.y - mouse.y * 0.5;

        // Draw meteor trail with linear gradient
        const grad = ctx.createLinearGradient(
          renderX,
          renderY,
          renderX - Math.cos(meteor.angle) * meteor.length,
          renderY - Math.sin(meteor.angle) * meteor.length,
        );
        grad.addColorStop(0, `rgba(255, 255, 255, ${meteor.opacity})`); // bright white head
        grad.addColorStop(0.15, `rgba(255, 45, 0, ${meteor.opacity * 0.85})`); // red/orange core
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)'); // fade out tail

        // Save canvas state to apply shadowBlur in red/orange glow
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.8;
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#FF2D00';
        ctx.moveTo(renderX, renderY);
        ctx.lineTo(
          renderX - Math.cos(meteor.angle) * meteor.length,
          renderY - Math.sin(meteor.angle) * meteor.length,
        );
        ctx.stroke();
        ctx.restore();
      });

      // Cleanup inactive meteors to keep array small
      while (meteors.length > 0 && !meteors[0].active) {
        meteors.shift();
      }

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
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 w-full h-full z-0 pointer-events-none opacity-80"
    />
  );
}
