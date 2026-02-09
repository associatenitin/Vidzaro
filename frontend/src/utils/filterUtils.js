/**
 * Filter utility functions for converting between filter formats
 * and applying filters to elements
 */

/**
 * Convert legacy string filter to new filter object structure
 */
export function convertStringToFilter(filterString) {
  if (!filterString || typeof filterString !== 'string') {
    return null;
  }

  // Map of built-in filters to their effect structures
  const builtinFilters = {
    'grayscale': { type: 'grayscale', value: 100 },
    'sepia': { type: 'sepia', value: 100 },
    'invert': { type: 'invert', value: 100 },
    'blur': { type: 'blur', value: 3 },
    'brightness': { type: 'brightness', value: 1.3 },
    'darken': { type: 'brightness', value: 0.7 },
    'contrast': { type: 'contrast', value: 1.5 },
    'saturate': { type: 'saturate', value: 1.8 },
    'desaturate': { type: 'saturate', value: 0.3 },
    'hue-rotate': { type: 'hue-rotate', value: 90 },
    'sharpen': { type: 'sharpen', value: 1.0 },
    'vintage': [
      { type: 'sepia', value: 40 },
      { type: 'contrast', value: 1.1 },
      { type: 'brightness', value: 0.9 }
    ],
    'cool': [
      { type: 'hue-rotate', value: 180 },
      { type: 'saturate', value: 0.8 }
    ],
    'warm': [
      { type: 'sepia', value: 30 },
      { type: 'saturate', value: 1.2 },
      { type: 'brightness', value: 1.05 }
    ]
  };

  const filterDef = builtinFilters[filterString];
  if (!filterDef) {
    return null;
  }

  const effects = Array.isArray(filterDef) 
    ? filterDef.map(e => ({ ...e, enabled: true }))
    : [{ ...filterDef, enabled: true }];

  return {
    type: 'builtin',
    name: filterString,
    effects
  };
}

/**
 * Convert filter object to CSS filter string
 */
export function convertFilterToCSS(filter) {
  if (!filter) return 'none';
  
  // Handle legacy string filters
  if (typeof filter === 'string') {
    const filterObj = convertStringToFilter(filter);
    if (!filterObj) return 'none';
    return convertFilterToCSS(filterObj);
  }

  // Handle filter object
  if (typeof filter !== 'object' || !filter.effects) {
    return 'none';
  }

  const enabledEffects = filter.effects.filter(e => e.enabled !== false);
  if (enabledEffects.length === 0) return 'none';

  const cssParts = enabledEffects.map(effect => {
    switch (effect.type) {
      case 'brightness':
        return `brightness(${effect.value})`;
      case 'contrast':
        return `contrast(${effect.value})`;
      case 'saturate':
        return `saturate(${effect.value})`;
      case 'blur':
        return `blur(${effect.value}px)`;
      case 'grayscale':
        return `grayscale(${effect.value}%)`;
      case 'sepia':
        return `sepia(${effect.value}%)`;
      case 'hue-rotate':
        return `hue-rotate(${effect.value}deg)`;
      case 'invert':
        return `invert(${effect.value}%)`;
      case 'sharpen':
        // CSS doesn't have a direct sharpen filter, so use contrast and brightness to simulate
        // Map sharpen value (0-3) to contrast (1.0-1.3) and brightness (1.0-1.05)
        const contrastValue = 1.0 + (effect.value * 0.1);
        const brightnessValue = 1.0 + (effect.value * 0.0167);
        return `contrast(${contrastValue}) brightness(${brightnessValue})`;
      default:
        return null;
    }
  }).filter(Boolean);

  return cssParts.length > 0 ? cssParts.join(' ') : 'none';
}

/**
 * Convert filter object back to string if it's a simple built-in filter
 */
export function convertFilterToString(filter) {
  if (!filter) return null;
  
  // Already a string
  if (typeof filter === 'string') {
    return filter || null;
  }

  // Check if it's a simple built-in filter (single effect matching built-in)
  if (filter.type === 'builtin' && filter.effects && filter.effects.length === 1) {
    const effect = filter.effects[0];
    const builtinMap = {
      'grayscale': { type: 'grayscale', value: 100 },
      'sepia': { type: 'sepia', value: 100 },
      'invert': { type: 'invert', value: 100 },
      'blur': { type: 'blur', value: 3 },
      'brightness': { type: 'brightness', value: 1.3 },
      'darken': { type: 'brightness', value: 0.7 },
      'contrast': { type: 'contrast', value: 1.5 },
      'saturate': { type: 'saturate', value: 1.8 },
      'desaturate': { type: 'saturate', value: 0.3 },
      'hue-rotate': { type: 'hue-rotate', value: 90 },
      'sharpen': { type: 'sharpen', value: 1.0 }
    };

    // Check if this matches a built-in exactly
    for (const [name, def] of Object.entries(builtinMap)) {
      if (effect.type === def.type && Math.abs(effect.value - def.value) < 0.01) {
        return name;
      }
    }
  }

  // Complex filter - return as object (will be stored as object)
  return null;
}

/**
 * Apply filter to a DOM element
 */
export function applyFilterToElement(element, filter) {
  if (!element) return;
  const cssFilter = convertFilterToCSS(filter);
  element.style.filter = cssFilter;
}

/**
 * Validate filter structure
 */
export function validateFilter(filter) {
  if (!filter) return true; // null/undefined is valid (no filter)
  
  if (typeof filter === 'string') {
    return true; // Legacy string filters are valid
  }

  if (typeof filter !== 'object') {
    return false;
  }

  if (!Array.isArray(filter.effects)) {
    return false;
  }

  // Validate each effect
  for (const effect of filter.effects) {
    if (!effect.type || typeof effect.value !== 'number') {
      return false;
    }
  }

  return true;
}

/**
 * Merge two filters (combine effects)
 */
export function mergeFilters(filter1, filter2) {
  if (!filter1) return filter2;
  if (!filter2) return filter1;

  // Convert strings to objects
  const obj1 = typeof filter1 === 'string' ? convertStringToFilter(filter1) : filter1;
  const obj2 = typeof filter2 === 'string' ? convertStringToFilter(filter2) : filter2;

  if (!obj1 || !obj2) {
    return filter1 || filter2;
  }

  // Combine effects, preferring filter2 for duplicates
  const effectsMap = new Map();
  
  // Add filter1 effects
  if (obj1.effects) {
    obj1.effects.forEach(effect => {
      effectsMap.set(effect.type, { ...effect });
    });
  }

  // Override with filter2 effects
  if (obj2.effects) {
    obj2.effects.forEach(effect => {
      effectsMap.set(effect.type, { ...effect });
    });
  }

  return {
    type: 'custom',
    name: obj2.name || obj1.name || 'Merged Filter',
    effects: Array.from(effectsMap.values())
  };
}

/**
 * Get default values for filter effects
 */
export function getEffectDefaults() {
  return {
    brightness: { min: 0, max: 2, default: 1, step: 0.1, unit: '' },
    contrast: { min: 0, max: 3, default: 1, step: 0.1, unit: '' },
    saturate: { min: 0, max: 2, default: 1, step: 0.1, unit: '' },
    blur: { min: 0, max: 20, default: 0, step: 0.5, unit: 'px' },
    grayscale: { min: 0, max: 100, default: 0, step: 1, unit: '%' },
    sepia: { min: 0, max: 100, default: 0, step: 1, unit: '' },
    'hue-rotate': { min: 0, max: 360, default: 0, step: 1, unit: 'deg' },
    invert: { min: 0, max: 100, default: 0, step: 1, unit: '%' },
    sharpen: { min: 0, max: 3, default: 1.0, step: 0.1, unit: '' }
  };
}

/**
 * Get display name for filter effect type
 */
export function getEffectDisplayName(type) {
  const names = {
    brightness: 'Brightness',
    contrast: 'Contrast',
    saturate: 'Saturation',
    blur: 'Blur',
    grayscale: 'Grayscale',
    sepia: 'Sepia',
    'hue-rotate': 'Hue Rotate',
    invert: 'Invert',
    sharpen: 'Sharpen'
  };
  return names[type] || type;
}

/**
 * Get display name for a filter (string or object)
 * @param {string|object} filter - The filter to get display name for
 * @param {object} project - Optional project object to look up preset names
 */
export function getFilterDisplayName(filter, project = null) {
  if (!filter) return '';
  
  // If it's a string, return it capitalized
  if (typeof filter === 'string') {
    return filter.charAt(0).toUpperCase() + filter.slice(1);
  }
  
  // If it's an object, check for name property
  if (typeof filter === 'object') {
    if (filter.name) {
      return filter.name;
    }
    
    // If it's a preset with id, try to find it in project
    if (filter.id && project?.customFilters) {
      const preset = project.customFilters.find(f => f.id === filter.id);
      if (preset && preset.name) {
        return preset.name;
      }
    }
    
    // If it has effects, show a summary
    if (filter.effects && Array.isArray(filter.effects)) {
      const enabledEffects = filter.effects.filter(e => e.enabled !== false);
      if (enabledEffects.length === 1) {
        return getEffectDisplayName(enabledEffects[0].type);
      } else if (enabledEffects.length > 1) {
        return `${enabledEffects.length} Effects`;
      }
    }
    
    return 'Custom Filter';
  }
  
  return '';
}
