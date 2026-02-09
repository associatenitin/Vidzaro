/**
 * Header brand area — logo + wordmark with animated dark fantasy background
 */

import WizardHatLogo from './WizardHatLogo';
import VidzaroWord from './VidzaroWord';
import './HeaderBrand.css';

export default function HeaderBrand() {
  return (
    <div className="header-brand">
      <div className="header-brand__bg" aria-hidden />
      <div className="header-brand__shimmer" aria-hidden />
      <h1 className="header-brand__content">
        <WizardHatLogo size={44} animated />
        <VidzaroWord animated />
      </h1>
    </div>
  );
}
