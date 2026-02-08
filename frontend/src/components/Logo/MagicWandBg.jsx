/**
 * Arcane mist shade — wizard-themed drifting wisps behind the menu bar
 */

import './MagicWandBg.css';

export default function MagicWandBg() {
  return (
    <div className="arcane-mist-bg" aria-hidden>
      <div className="arcane-mist-bg__base" />
      <div className="arcane-mist-bg__wisp arcane-mist-bg__wisp--1" />
      <div className="arcane-mist-bg__wisp arcane-mist-bg__wisp--2" />
      <div className="arcane-mist-bg__wisp arcane-mist-bg__wisp--3" />
      <div className="arcane-mist-bg__wisp arcane-mist-bg__wisp--4" />
      <div className="arcane-mist-bg__shimmer" />
      <div className="arcane-mist-bg__glow-edge" />
      {/* Sparkles */}
      {[5, 15, 25, 35, 45, 55, 65, 75, 85, 95].map((left, i) => (
        <div
          key={i}
          className="arcane-mist-bg__sparkle"
          style={{
            left: `${left}%`,
            top: `${20 + (i % 3) * 25}%`,
            animationDelay: `${i * 0.4}s`,
          }}
        />
      ))}
    </div>
  );
}
