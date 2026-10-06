// Shared UI for the Portlock sales pages (homepage, the skill thank-you page, and the Free Video pages).
(()=>{const reduce=matchMedia('(prefers-reduced-motion: reduce)'),coarse=matchMedia('(pointer: coarse)');
const reveals=document.querySelectorAll('.reveal');if('IntersectionObserver'in window&&!reduce.matches){const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{rootMargin:'0px 0px -5% 0px',threshold:.04});reveals.forEach(e=>io.observe(e))}else reveals.forEach(e=>e.classList.add('in'));
const osWrap=document.querySelector('.os-wrap'),hero=document.querySelector('.hero'),closingSection=document.querySelector('.closing'),mobileCta=document.querySelector('.mobile-cta');let heroVisible=true,closingVisible=false;const syncViewportState=()=>{osWrap?.classList.toggle('paused',!heroVisible);mobileCta?.classList.toggle('show',!heroVisible&&!closingVisible)};if('IntersectionObserver'in window){if(hero)new IntersectionObserver(([e])=>{heroVisible=e.isIntersecting;syncViewportState()},{threshold:.05}).observe(hero);if(closingSection)new IntersectionObserver(([e])=>{closingVisible=e.isIntersecting;syncViewportState()},{threshold:.15}).observe(closingSection)}else syncViewportState();
document.querySelector('.os-wrap')?.addEventListener('pointermove',e=>{if(coarse.matches||reduce.matches)return;const r=e.currentTarget.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5,p=e.currentTarget.querySelector('.os-canvas');p.style.setProperty('--ry',`${x*2}deg`);p.style.setProperty('--rx',`${y*-1.5}deg`)});document.querySelector('.os-wrap')?.addEventListener('pointerleave',e=>{const p=e.currentTarget.querySelector('.os-canvas');p.style.setProperty('--ry','0deg');p.style.setProperty('--rx','0deg')});
document.addEventListener('pointermove',e=>{if(coarse.matches||reduce.matches)return;const s=e.target.closest('.spotlight');if(!s)return;const r=s.getBoundingClientRect();s.style.setProperty('--mx',`${e.clientX-r.left}px`);s.style.setProperty('--my',`${e.clientY-r.top}px`)});
document.querySelectorAll('.faq-q').forEach(b=>{const toggle=()=>{const item=b.closest('.faq-item'),opening=!item.classList.contains('open');document.querySelectorAll('.faq-item').forEach(i=>{i.classList.remove('open');const q=i.querySelector('.faq-q'),a=document.getElementById(q.getAttribute('aria-controls'));q.setAttribute('aria-expanded','false');a.setAttribute('aria-hidden','true')});if(opening){item.classList.add('open');b.setAttribute('aria-expanded','true');document.getElementById(b.getAttribute('aria-controls')).setAttribute('aria-hidden','false')}};b.addEventListener('click',toggle)});
})();

(()=>{
// Gate: "Book a Call" opens the Tally screening form as a popup; qualified answers
// redirect to Calendly (with name/email prefilled) inside Tally itself.
const FORM='2EdJOb';
const openPopup=e=>{
  if(!window.Tally)return; // script not ready — let the link fall through to the full-page form
  e.preventDefault();
  Tally.openPopup(FORM,{layout:'modal',width:640,overlay:true});
};
document.querySelectorAll('a[data-book]').forEach(a=>a.addEventListener('click',openPopup));
})();

(()=>{
// VSL: the hero video autoplays muted; the first click restarts it from the top with sound.
// Without player.js the overlay stays hidden and Bunny's own controls still work.
const box=document.querySelector('.vsl');if(!box||!window.playerjs)return;
const btn=box.querySelector('.vsl-sound'),player=new playerjs.Player(box.querySelector('iframe'));
player.on('ready',()=>{btn.hidden=false;btn.addEventListener('click',()=>{player.unmute();player.setCurrentTime(0);player.play();btn.hidden=true},{once:true})});
})();
