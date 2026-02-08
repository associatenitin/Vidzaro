/**
 * Vidzaro animated logo — dark fantasy wizard magic theme
 * Sequence: Rune circle appears → Magical energy condenses into V → Pulse → Settle
 */

import './VidzaroLogo.css';

export default function VidzaroLogo({ className = '', size = 32, animated = true }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`vidzaro-logo ${animated ? 'vidzaro-logo--animated' : ''} ${className}`}
      aria-hidden
    >
      <defs>
        <linearGradient id="vidzaro-circle-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2d1b4e" />
          <stop offset="50%" stopColor="#1e1b4b" />
          <stop offset="100%" stopColor="#0f0a1e" />
        </linearGradient>
        <linearGradient id="vidzaro-v-grad" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#4a1942" />
          <stop offset="50%" stopColor="#6b21a8" />
          <stop offset="100%" stopColor="#c0c5ce" />
        </linearGradient>
        <radialGradient id="vidzaro-glow">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.6" />
          <stop offset="70%" stopColor="#6b21a8" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#1e1b4b" stopOpacity="0" />
        </radialGradient>
        <filter id="vidzaro-glow-filter">
          <feGaussianBlur stdDeviation="0.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="vidzaro-glow-strong">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background glow (subtle) */}
      <circle
        cx="32"
        cy="32"
        r="30"
        fill="url(#vidzaro-glow)"
        className="vidzaro-logo__glow"
      />

      {/* Outer rune circle */}
      <circle
        cx="32"
        cy="32"
        r="26"
        fill="none"
        stroke="url(#vidzaro-circle-grad)"
        strokeWidth="1.2"
        strokeDasharray="163"
        strokeDashoffset="163"
        className="vidzaro-logo__circle"
      />

      {/* Inner ring (subtle) */}
      <circle
        cx="32"
        cy="32"
        r="20"
        fill="none"
        stroke="#2d1b4e"
        strokeWidth="0.6"
        strokeOpacity="0"
        className="vidzaro-logo__inner-ring"
      />

      {/* Rune marks (8 radial dashes around the circle) */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 32 + 20 * Math.cos(rad);
        const y1 = 32 + 20 * Math.sin(rad);
        const x2 = 32 + 26 * Math.cos(rad);
        const y2 = 32 + 26 * Math.sin(rad);
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#a78bfa"
            strokeWidth="1"
            strokeOpacity="0"
            className="vidzaro-logo__rune"
            style={{ animationDelay: `${0.8 + i * 0.04}s` }}
          />
        );
      })}

      {/* Energy particles — orbit and condense into V */}
      <g className="vidzaro-logo__particles" transform="translate(32, 32)">
        {[...Array(12)].map((_, i) => {
          const angle = (i / 12) * Math.PI * 2;
          const r = 22 + (i % 3) * 2;
          const x = r * Math.cos(angle);
          const y = -r * Math.sin(angle);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={i % 2 === 0 ? 1 : 0.6}
              fill="#c0c5ce"
              className="vidzaro-logo__particle"
              style={{ animationDelay: `${1.1 + i * 0.04}s` }}
            />
          );
        })}
      </g>

      {/* Sharp V symbol — wizard's sigil */}
      <path
        d="M 32 14 L 20 50 L 27 50 L 32 38 L 37 50 L 44 50 Z"
        fill="none"
        stroke="url(#vidzaro-v-grad)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="85"
        strokeDashoffset="85"
        filter="url(#vidzaro-glow-filter)"
        className="vidzaro-logo__v"
      />
    </svg>
  );
}
