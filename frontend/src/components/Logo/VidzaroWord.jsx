/**
 * Animated "Vidzaro" wordmark — gradient text with shimmer sweep and letter reveal
 */

import './VidzaroWord.css';

export default function VidzaroWord({ animated = true }) {
  const letters = 'Vidzaro'.split('');

  return (
    <span className={`vidzaro-word ${animated ? 'vidzaro-word--animated' : ''}`}>
      <span className="vidzaro-word__gradient">
        {letters.map((letter, i) => (
          <span
            key={i}
            className="vidzaro-word__letter"
            style={{ animationDelay: `${1.2 + i * 0.04}s` }}
          >
            {letter}
          </span>
        ))}
      </span>
      <span className="vidzaro-word__shimmer" aria-hidden />
    </span>
  );
}
