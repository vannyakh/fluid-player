/**
 * GSAP vendor entry — loads bundled gsap.min.js (see vendor/gsap.min.js).
 * @license GSAP Standard License — https://gsap.com/standard-license
 */
import gsapBundle from './gsap.min.js';

const gsap = gsapBundle.gsap || gsapBundle.default || gsapBundle;

export default gsap;
export { gsap };
