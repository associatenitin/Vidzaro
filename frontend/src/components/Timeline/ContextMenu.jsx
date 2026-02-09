import { useEffect, useRef, useState } from 'react';

export default function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ top: y, left: x });

  useEffect(() => {
    if (!menuRef.current) return;

    const updatePosition = () => {
      const menu = menuRef.current;
      if (!menu) return;

      const menuRect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const menuWidth = menuRect.width || 200;
      const menuHeight = menuRect.height || 300;

      let top = y + 8;
      let left = x + 8;

      // Check horizontal overflow
      const spaceOnRight = viewportWidth - x;
      const spaceOnLeft = x;

      if (spaceOnRight < menuWidth && spaceOnLeft > menuWidth) {
        left = x - menuWidth - 8;
      } else if (spaceOnRight < menuWidth && spaceOnLeft < menuWidth) {
        if (x < viewportWidth / 2) {
          left = 8;
        } else {
          left = viewportWidth - menuWidth - 8;
        }
      }

      // Check vertical overflow
      const spaceBelow = viewportHeight - y;
      const spaceAbove = y;

      if (spaceBelow < menuHeight && spaceAbove > menuHeight) {
        top = y - menuHeight - 8;
      } else if (spaceBelow < menuHeight && spaceAbove < menuHeight) {
        if (y < viewportHeight / 2) {
          top = 8;
        } else {
          top = viewportHeight - menuHeight - 8;
        }
      }

      // Ensure menu stays within viewport bounds
      top = Math.max(8, Math.min(top, viewportHeight - menuHeight - 8));
      left = Math.max(8, Math.min(left, viewportWidth - menuWidth - 8));

      setPosition({ top, left });
    };

    setTimeout(updatePosition, 0);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [x, y]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  if (!items || items.length === 0) return null;

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 10000,
      }}
      className="bg-slate-800 border border-slate-700 rounded shadow-xl py-1 min-w-[180px]"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, index) => {
        if (item.separator) {
          return <div key={index} className="h-px bg-slate-700 my-1" />;
        }

        if (item.disabled) {
          return (
            <div
              key={index}
              className="px-3 py-1.5 text-xs text-slate-600 cursor-not-allowed"
            >
              {item.label}
            </div>
          );
        }

        return (
          <button
            key={index}
            onClick={(e) => {
              e.stopPropagation();
              if (item.onClick) {
                item.onClick();
              }
              onClose();
            }}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-700 text-slate-300 flex items-center justify-between gap-2"
          >
            <span className="flex items-center gap-2">
              {item.icon && <span>{item.icon}</span>}
              <span>{item.label}</span>
            </span>
            {item.shortcut && (
              <span className="text-[10px] text-slate-500 font-mono">
                {item.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
