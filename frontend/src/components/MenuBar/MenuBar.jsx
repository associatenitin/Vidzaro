import { useState, useRef, useEffect } from 'react';

function MenuItem({ label, shortcut, disabled, onClick, divider }) {
  if (divider) {
    return <div className="my-1 border-t border-slate-600" role="separator" />;
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full px-3 py-1.5 text-left text-sm flex items-center justify-between gap-6 rounded hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      <span>{label}</span>
      {shortcut && <span className="text-slate-500 text-xs font-mono">{shortcut}</span>}
    </button>
  );
}

function Menu({ label, children, open, onOpen, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onClose]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => onOpen(open ? null : label)}
        className="px-3 py-2 text-sm font-medium text-slate-200 hover:text-white hover:bg-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-slate-500"
      >
        {label}
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-0.5 min-w-[200px] py-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50"
          role="menu"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export default function MenuBar({
  onNewProject,
  onOpen,
  onSave,
  onSaveAs,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onDeleteSelected,
  onDeselect,
  hasSelection,
  onStartRecording,
  onExport,
  canExport,
  onVideoMorph,
  onOpenPreferences,
  onKeyboardShortcuts,
  onAbout,
  onResetTimelineHeight,
}) {
  const [openMenu, setOpenMenu] = useState(null);

  const closeMenu = () => setOpenMenu(null);

  return (
    <div className="flex items-center gap-1 h-full">
      <Menu label="File" open={openMenu === 'File'} onOpen={setOpenMenu} onClose={closeMenu}>
        <div className="px-2 py-1">
          <MenuItem label="New Project" shortcut="Ctrl+N" onClick={() => { onNewProject?.(); closeMenu(); }} />
          <MenuItem label="Open..." shortcut="Ctrl+O" onClick={() => { onOpen?.(); closeMenu(); }} />
          <MenuItem divider />
          <MenuItem label="Save" shortcut="Ctrl+S" onClick={() => { onSave?.(); closeMenu(); }} />
          <MenuItem label="Save As..." onClick={() => { onSaveAs?.(); closeMenu(); }} />
        </div>
      </Menu>

      <Menu label="Edit" open={openMenu === 'Edit'} onOpen={setOpenMenu} onClose={closeMenu}>
        <div className="px-2 py-1">
          <MenuItem label="Undo" shortcut="Ctrl+Z" disabled={!canUndo} onClick={() => { onUndo?.(); closeMenu(); }} />
          <MenuItem label="Redo" shortcut="Ctrl+Shift+Z" disabled={!canRedo} onClick={() => { onRedo?.(); closeMenu(); }} />
          <MenuItem divider />
          <MenuItem label="Delete" shortcut="Del" disabled={!hasSelection} onClick={() => { onDeleteSelected?.(); closeMenu(); }} />
          <MenuItem label="Deselect" shortcut="Esc" onClick={() => { onDeselect?.(); closeMenu(); }} />
        </div>
      </Menu>

      <Menu label="View" open={openMenu === 'View'} onOpen={setOpenMenu} onClose={closeMenu}>
        <div className="px-2 py-1">
          <MenuItem label="Reset timeline height" onClick={() => { onResetTimelineHeight?.(); closeMenu(); }} />
        </div>
      </Menu>

      <Menu label="Record" open={openMenu === 'Record'} onOpen={setOpenMenu} onClose={closeMenu}>
        <div className="px-2 py-1">
          <MenuItem label="Start Recording" onClick={() => { onStartRecording?.(); closeMenu(); }} />
        </div>
      </Menu>

      <Menu label="Tools" open={openMenu === 'Tools'} onOpen={setOpenMenu} onClose={closeMenu}>
        <div className="px-2 py-1">
          <MenuItem label="Video Morph..." onClick={() => { onVideoMorph?.(); closeMenu(); }} />
          <MenuItem divider />
          <MenuItem label="Preferences..." onClick={() => { onOpenPreferences?.(); closeMenu(); }} />
        </div>
      </Menu>

      <Menu label="Export" open={openMenu === 'Export'} onOpen={setOpenMenu} onClose={closeMenu}>
        <div className="px-2 py-1">
          <MenuItem label="Export Video..." disabled={!canExport} onClick={() => { onExport?.(); closeMenu(); }} />
        </div>
      </Menu>

      <Menu label="Help" open={openMenu === 'Help'} onOpen={setOpenMenu} onClose={closeMenu}>
        <div className="px-2 py-1">
          <MenuItem label="Keyboard Shortcuts" onClick={() => { onKeyboardShortcuts?.(); closeMenu(); }} />
          <MenuItem label="About Vidzaro" onClick={() => { onAbout?.(); closeMenu(); }} />
        </div>
      </Menu>
    </div>
  );
}
