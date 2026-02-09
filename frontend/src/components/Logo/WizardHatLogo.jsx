/**
 * Animated Wizard Hat Logo — dark fantasy wizard magic theme
 * Sequence: Hat materializes → Stars sparkle → Magical glow pulses → Settle with breathing effect
 */

import './WizardHatLogo.css';

export default function WizardHatLogo({ className = '', size = 32, animated = true }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`wizard-hat-logo ${animated ? 'wizard-hat-logo--animated' : ''} ${className}`}
      aria-hidden
    >
      <defs>
        {/* Hat gradient */}
        <linearGradient id="hat-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2d1b4e" />
          <stop offset="50%" stopColor="#4a1942" />
          <stop offset="100%" stopColor="#1e1b4b" />
        </linearGradient>
        
        {/* Hat highlight gradient */}
        <linearGradient id="hat-highlight" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6b21a8" stopOpacity="0.8" />
          <stop offset="50%" stopColor="#a78bfa" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#c0c5ce" stopOpacity="0.2" />
        </linearGradient>
        
        {/* Brim gradient */}
        <linearGradient id="brim-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e1b4b" />
          <stop offset="50%" stopColor="#2d1b4e" />
          <stop offset="100%" stopColor="#0f0a1e" />
        </linearGradient>
        
        {/* Star gradient */}
        <radialGradient id="star-grad">
          <stop offset="0%" stopColor="#c0c5ce" stopOpacity="1" />
          <stop offset="50%" stopColor="#a78bfa" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#6b21a8" stopOpacity="0" />
        </radialGradient>
        
        {/* Magical glow */}
        <radialGradient id="magic-glow">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.6" />
          <stop offset="50%" stopColor="#6b21a8" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#1e1b4b" stopOpacity="0" />
        </radialGradient>
        
        {/* Glow filter */}
        <filter id="hat-glow-filter">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        
        {/* Strong glow for stars */}
        <filter id="star-glow-filter">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background magical glow */}
      <circle
        cx="32"
        cy="32"
        r="28"
        fill="url(#magic-glow)"
        className="wizard-hat-logo__glow"
      />

      {/* Wizard Hat - Brim (bottom part) */}
      <ellipse
        cx="32"
        cy="48"
        rx="18"
        ry="6"
        fill="url(#brim-grad)"
        className="wizard-hat-logo__brim"
      />

      {/* Wizard Hat - Cone (main body) */}
      <path
        d="M 32 12 L 20 48 L 44 48 Z"
        fill="url(#hat-grad)"
        stroke="#4a1942"
        strokeWidth="0.5"
        className="wizard-hat-logo__hat"
      />

      {/* Hat highlight/shine */}
      <path
        d="M 32 12 L 26 42 L 38 42 Z"
        fill="url(#hat-highlight)"
        className="wizard-hat-logo__highlight"
      />

      {/* Hat band/decorative stripe */}
      <ellipse
        cx="32"
        cy="42"
        rx="12"
        ry="2"
        fill="#6b21a8"
        stroke="#a78bfa"
        strokeWidth="0.3"
        className="wizard-hat-logo__band"
      />

      {/* Magical stars/sparkles around the hat */}
      {[
        { x: 18, y: 20, delay: 0.8 },
        { x: 46, y: 22, delay: 0.9 },
        { x: 16, y: 35, delay: 1.0 },
        { x: 48, y: 38, delay: 1.1 },
        { x: 24, y: 16, delay: 1.2 },
        { x: 40, y: 18, delay: 1.3 },
        { x: 20, y: 28, delay: 1.4 },
        { x: 44, y: 30, delay: 1.5 },
      ].map((star, i) => (
        <g key={i} className="wizard-hat-logo__star" style={{ animationDelay: `${star.delay}s` }}>
          <circle
            cx={star.x}
            cy={star.y}
            r="2"
            fill="url(#star-grad)"
            filter="url(#star-glow-filter)"
          />
          <circle
            cx={star.x}
            cy={star.y}
            r="1"
            fill="#c0c5ce"
          />
        </g>
      ))}

      {/* Magical particles/sparkles */}
      <g className="wizard-hat-logo__particles">
        {[...Array(8)].map((_, i) => {
          const angle = (i / 8) * Math.PI * 2;
          const r = 24 + (i % 2) * 3;
          const x = 32 + r * Math.cos(angle);
          const y = 32 + r * Math.sin(angle);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={i % 2 === 0 ? 1.2 : 0.8}
              fill="#a78bfa"
              className="wizard-hat-logo__particle"
              style={{ animationDelay: `${1.6 + i * 0.1}s` }}
            />
          );
        })}
      </g>
    </svg>
  );
}
