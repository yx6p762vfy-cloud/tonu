/* ═══════════════════════════════════════════
   tonú — Shared JS
   Cart · Cursor · Nav · Toast · Products
   ═══════════════════════════════════════════ */

/* ── PRODUCTS — single source of truth ── */
const PRODUCTS = [
  {
    id:'p1', name:'Veste Kente Street-Tailoring', brand:'tonú Signature', cat:'Vestes',
    price:69000, priceDisplay:'69 000',
    clothColor:'#C8973A',
    bgGrad:'linear-gradient(160deg,#1E3D2F,#0A1A10)',
    pvClass:'pv1', clothClass:'c1',
    sizes:['XS','S','M','L','XL'],
    desc:'Une veste d\'exception inspirée du tissage Kente. Coupe street-tailoring moderne sur tissu structuré, motifs wax intégrés en contraste. Doublure satinée dorée.',
    badge:'Nouveau',
    image:'images/1.jpeg'
  },
  {
    id:'p2', name:'Chemise Sable & Motifs', brand:'tonú Heritage', cat:'Chemises',
    price:47000, priceDisplay:'47 000',
    clothColor:'#EFE8D8',
    bgGrad:'linear-gradient(160deg,#2E1A08,#4D3018)',
    pvClass:'pv2', clothClass:'c2',
    sizes:['S','M','L'],
    desc:'Chemise oversize en coton sable léger. Broderies traditionnelles en fil d\'or sur col et poignets. Entre héritage et modernité.',
    badge:'New In',
    image:'images/2.jpeg'
  },
  {
    id:'p3', name:'Pantalon Oversize Forêt', brand:'tonú Street', cat:'Pantalons',
    price:35000, priceDisplay:'35 000',
    clothColor:'#3D6E56',
    bgGrad:'linear-gradient(160deg,#0C0C1C,#1A1A38)',
    pvClass:'pv3', clothClass:'c3',
    sizes:['34','36','38','40','42','44'],
    desc:'Pantalon large en sergé épais vert forêt. Coupe architecturale avec pinces marquées. Taille élastiquée au dos.',
    badge:null,
    image:'images/3.jpeg'
  },
  {
    id:'p4', name:'Hoodie Heritage Dark', brand:'tonú Premium', cat:'Hoodies',
    price:58000, priceDisplay:'58 000',
    clothColor:'#4D3018',
    bgGrad:'linear-gradient(160deg,#1E1208,#3A2210)',
    pvClass:'pv4', clothClass:'c4',
    sizes:['XS','S','M','L','XL','XXL'],
    desc:'Hoodie en molleton premium 380g. Patch brodé tonú en or sur la poitrine. Hood ajusté, poche kangourou renforcée.',
    badge:null,
    image:'images/2.jpeg'
  },
  {
    id:'p5', name:'Set Gold Edition', brand:'tonú Collector', cat:'Ensembles',
    price:125000, priceDisplay:'125 000',
    clothColor:'#EDD98A',
    bgGrad:'linear-gradient(160deg,#2D5240,#1E3D2F)',
    pvClass:'pv5', clothClass:'c5',
    sizes:['S','M','L','XL'],
    desc:'Ensemble deux pièces collector — veste courte et pantalon cargo. Tissu gabardine traité déperlant. Finitions or brossé.',
    badge:'Limited',
    image:'images/3.jpeg'
  },
  {
    id:'p6', name:'Bomber Adinkra Print', brand:'tonú Signature', cat:'Vestes',
    price:82000, priceDisplay:'82 000',
    clothColor:'#1A3A2A',
    bgGrad:'linear-gradient(160deg,#0A1E14,#1A3A2A)',
    pvClass:'pv1', clothClass:'c3',
    sizes:['S','M','L','XL'],
    desc:'Bomber en nylon imperméable avec imprimés Adinkra en jacquard. Col en velours côtelé. Doublure satin crème.',
    badge:'Exclusif',
    image:'images/1.jpeg'
  }
];

/* ── HELPERS ── */
const CLOTH_COLORS = ['#C8973A','#EFE8D8','#3D6E56','#4D3018','#EDD98A','#1A3A2A'];
const BG_GRADS = [
  'linear-gradient(160deg,#1E3D2F,#0A1A10)',
  'linear-gradient(160deg,#2E1A08,#4D3018)',
  'linear-gradient(160deg,#0C0C1C,#1A1A38)',
  'linear-gradient(160deg,#1E1208,#3A2210)',
  'linear-gradient(160deg,#2D5240,#1E3D2F)',
  'linear-gradient(160deg,#0A1E14,#1A3A2A)',
];
function getProductBg(idx){return BG_GRADS[idx%BG_GRADS.length]}
function getProductCloth(idx){return CLOTH_COLORS[idx%CLOTH_COLORS.length]}

/* ── CART ── */
const CART = {
  items: [],

  init(){
    try { this.items = JSON.parse(localStorage.getItem('tonu_cart') || '[]'); }
    catch(e){ this.items = []; }
    this.updateUI();
  },

  save(){
    try { localStorage.setItem('tonu_cart', JSON.stringify(this.items)); }
    catch(e){}
    this.updateUI();
  },

  add(product){
    const existing = this.items.find(i => i.id === product.id && i.size === product.size);
    if(existing){ existing.qty++; }
    else { this.items.push({...product, qty: 1}); }
    this.save();
    this.flash();
  },

  remove(id, size){
    this.items = this.items.filter(i => !(i.id===id && i.size===size));
    this.save();
  },

  updateQty(id, size, qty){
    const item = this.items.find(i => i.id===id && i.size===size);
    if(item){ item.qty = Math.max(1, qty); this.save(); }
  },

  total(){
    return this.items.reduce((s,i) => s + i.price * i.qty, 0);
  },

  count(){
    return this.items.reduce((s,i) => s + i.qty, 0);
  },

  updateUI(){
    const c = this.count();
    document.querySelectorAll('.cart-count,.cf-count').forEach(el => {
      el.textContent = c;
      el.style.display = c > 0 ? 'flex' : 'none';
    });
    document.querySelectorAll('.cart-count-txt').forEach(el => {
      el.textContent = c;
    });
    document.querySelectorAll('.nav-cart-label').forEach(el => {
      el.textContent = `Panier (${c})`;
    });
  },

  flash(){
    document.querySelectorAll('.cart-float,.nav-action-btn.cart-btn').forEach(el => {
      el.classList.add('pulse');
      setTimeout(()=>el.classList.remove('pulse'),400);
    });
  }
};

/* ── CURSOR ── */
function initCursor(){
  const dot = document.getElementById('cur-dot');
  const ring = document.getElementById('cur-ring');
  if(!dot || !ring) return;
  let mx=0,my=0,rx=0,ry=0;
  document.addEventListener('mousemove', e => {
    mx=e.clientX; my=e.clientY;
    dot.style.transform=`translate(${mx-2.5}px,${my-2.5}px)`;
  });
  (function loop(){
    rx+=(mx-rx)*.12; ry+=(my-ry)*.12;
    ring.style.transform=`translate(${rx-14}px,${ry-14}px)`;
    requestAnimationFrame(loop);
  })();
  document.querySelectorAll('a,button,.pc,.size-btn,.qty-btn,.pay-opt,.ship-opt,.acc-head,[data-hover]').forEach(el=>{
    el.addEventListener('mouseenter',()=>document.body.classList.add('cur-hover'));
    el.addEventListener('mouseleave',()=>document.body.classList.remove('cur-hover'));
  });
  document.querySelectorAll('input,textarea').forEach(el=>{
    el.addEventListener('mouseenter',()=>document.body.classList.add('cur-text'));
    el.addEventListener('mouseleave',()=>document.body.classList.remove('cur-text'));
  });
}

/* ── NAV ── */
function initNav(){
  const nav = document.querySelector('.main-nav');
  window.addEventListener('scroll',()=>{
    if(!nav) return;
    nav.classList.toggle('scrolled', scrollY > 10);
    const prog = document.getElementById('scroll-prog');
    if(prog) prog.style.transform = `scaleX(${scrollY/(document.body.scrollHeight-innerHeight)})`;
  },{passive:true});

  // Ham
  const ham = document.getElementById('ham-btn');
  const mob = document.getElementById('mob-overlay');
  if(ham && mob){
    ham.addEventListener('click',()=>{
      ham.classList.toggle('open');
      mob.classList.toggle('open');
      document.body.style.overflow = mob.classList.contains('open') ? 'hidden' : '';
    });
    mob.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{
      ham.classList.remove('open');
      mob.classList.remove('open');
      document.body.style.overflow='';
    }));
  }
}

/* ── REVEAL ── */
function initReveal(){
  const obs = new IntersectionObserver(entries=>entries.forEach(e=>{
    if(e.isIntersecting) e.target.classList.add('vis');
  }),{threshold:.05,rootMargin:'0px 0px -40px 0px'});
  document.querySelectorAll('.reveal').forEach(el=>obs.observe(el));
}

/* ── TOAST ── */
function showToast(msg, type='success'){
  const t = document.createElement('div');
  t.className = `sw-toast ${type}`;
  t.innerHTML = `<span class="ti">${type==='success'?'✓':'✕'}</span><span>${msg}</span>`;
  document.body.appendChild(t);
  requestAnimationFrame(()=>requestAnimationFrame(()=>t.classList.add('show')));
  setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),400);},3000);
}

/* ── PRODUCT CARD RENDERER ── */
function renderProductCard(p, idx){
  const imgSrc = p.image || '';
  const imgHTML = imgSrc
    ? `<img src="${imgSrc}" alt="${p.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">`
    : '';
  const clothHTML = `<div class="pc-cloth" style="background:${p.clothColor||CLOTH_COLORS[idx%CLOTH_COLORS.length]};display:${imgSrc?'none':'block'}"></div>`;
  const badgeHTML = p.badge ? `<div class="pc-badge ${p.badge==='Limited'?'sale':p.badge==='New In'?'new':''}">${p.badge}</div>` : '';

  return `<a class="pc reveal d${(idx%4)+1}" href="product.html?id=${p.id}">
    <div class="pc-img" style="background:${p.bgGrad||BG_GRADS[idx%BG_GRADS.length]}">
      ${imgHTML}
      <div class="pc-img-placeholder" style="display:${imgSrc?'none':'flex'}">${clothHTML}</div>
      ${badgeHTML}
      <button class="pc-quick-add" onclick="event.preventDefault();event.stopPropagation();quickAdd('${p.id}')">Ajouter au panier</button>
    </div>
    <div class="pc-info">
      <div class="pc-brand">${p.brand}</div>
      <div class="pc-name">${p.name}</div>
      <div class="pc-price-row">
        <span class="pc-price">${p.priceDisplay} FCFA</span>
      </div>
    </div>
  </a>`;
}

function quickAdd(id){
  const p = PRODUCTS.find(x=>x.id===id);
  if(!p) return;
  CART.add({...p, size: p.sizes[0]});
  showToast(`${p.name} ajouté au panier`);
}

/* ── NAV SHARED HTML HELPER ── */
function buildNavHTML({activePage=''}={}){
  return `
  <div id="cur-dot"></div><div id="cur-ring"></div>
  <div id="scroll-prog"></div>

  <!-- TOP BAR -->
  <div class="top-bar">
    <div class="top-bar-marquee">
      <div class="top-bar-marquee-inner">
        <span class="top-bar-item"><span class="dot">✦</span> Livraison offerte dès 50 000 FCFA</span>
        <span class="top-bar-item"><span class="dot">✦</span> Paiement Mobile Money & Carte accepté</span>
        <span class="top-bar-item"><span class="dot">✦</span> Retours gratuits 30 jours</span>
        <span class="top-bar-item"><span class="dot">✦</span> Service client 7j/7</span>
        <span class="top-bar-item"><span class="dot">✦</span> Livraison offerte dès 50 000 FCFA</span>
        <span class="top-bar-item"><span class="dot">✦</span> Paiement Mobile Money & Carte accepté</span>
        <span class="top-bar-item"><span class="dot">✦</span> Retours gratuits 30 jours</span>
        <span class="top-bar-item"><span class="dot">✦</span> Service client 7j/7</span>
      </div>
    </div>
    <div class="top-bar-right">
      <a href="#" class="top-bar-link">Guide des tailles</a>
      <a href="#" class="top-bar-link">Contact</a>
    </div>
  </div>

  <!-- MAIN NAV -->
  <nav class="main-nav" id="main-nav">
    <div class="nav-inner">
      <a href="index.html" class="nav-logo">
        <img src="TonuIcon.jpeg" alt="tonú" class="nav-logo-img"/>
      </a>
      <ul class="nav-links">
        <li class="${activePage==='new'?'active':''}">
          <a href="product.html">Nouveautés</a>
        </li>
        <li class="${activePage==='collection'?'active':''}">
          <a href="product.html">Collection</a>
          <div class="mega-menu">
            <div class="mega-inner">
              <div class="mega-col">
                <div class="mega-col-title">Catégories</div>
                <a href="product.html" class="mega-link">Toute la collection</a>
                <a href="product.html?cat=vestes" class="mega-link">Vestes & Manteaux</a>
                <a href="product.html?cat=chemises" class="mega-link">Chemises</a>
                <a href="product.html?cat=pantalons" class="mega-link">Pantalons</a>
                <a href="product.html?cat=hoodies" class="mega-link">Hoodies & Sweats</a>
                <a href="product.html?cat=ensembles" class="mega-link">Ensembles</a>
              </div>
              <div class="mega-col">
                <div class="mega-col-title">Univers</div>
                <a href="product.html" class="mega-link">Street Noble</a>
                <a href="product.html" class="mega-link">Heritage Africa</a>
                <a href="product.html" class="mega-link">Urban Tailoring</a>
                <a href="product.html" class="mega-link">Gold Edition</a>
                <a href="product.html" class="mega-link">Collector</a>
              </div>
              <div class="mega-col">
                <div class="mega-col-title">Sélection</div>
                <a href="product.html?id=p1" class="mega-link">Veste Kente</a>
                <a href="product.html?id=p5" class="mega-link">Set Gold Edition</a>
                <a href="product.html?id=p6" class="mega-link">Bomber Adinkra</a>
                <a href="product.html" class="mega-link">Nouvelles pièces</a>
              </div>
            </div>
          </div>
        </li>
        <li><a href="product.html">Vestes</a></li>
        <li><a href="product.html">Chemises</a></li>
        <li><a href="product.html">Hoodies</a></li>
        <li><a href="product.html">Accessoires</a></li>
      </ul>
      <div class="nav-actions">
        <button class="nav-action-btn" title="Rechercher">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>
        </button>
        <a href="cart.html" class="nav-action-btn cart-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          <span class="nav-cart-label">Panier (0)</span>
          <span class="nav-cart-count cart-count" style="display:none">0</span>
        </a>
        <button class="ham-btn" id="ham-btn" aria-label="Menu">
          <span class="ham-line"></span>
          <span class="ham-line"></span>
          <span class="ham-line"></span>
        </button>
      </div>
    </div>
  </nav>

  <!-- MOBILE OVERLAY -->
  <div class="mob-overlay" id="mob-overlay">
    <ul class="mob-nav-links">
      <li><a href="index.html">Accueil <span>→</span></a></li>
      <li><a href="product.html">Nouveautés <span>→</span></a></li>
      <li><a href="product.html">Collection <span>→</span></a></li>
      <li><a href="product.html">Vestes <span>→</span></a></li>
      <li><a href="product.html">Chemises <span>→</span></a></li>
      <li><a href="product.html">Hoodies <span>→</span></a></li>
      <li><a href="cart.html">Panier <span>→</span></a></li>
    </ul>
  </div>

  <!-- CART FLOAT -->
  <a href="cart.html" class="cart-float">
    🛒<span class="cf-count" style="display:none">0</span>
  </a>
  `;
}

function buildFooterHTML(){
  return `
  <footer>
    <div class="footer-top">
      <div class="footer-col">
        <div class="footer-logo-row">
          <img src="TonuIcon.jpeg" alt="tonú" class="footer-logo-img"/>
        </div>
        <p class="footer-tagline">Where Tradition Meets Style. Né pour l'homme moderne africain — stylé, ancré, confiant.</p>
        <div class="footer-social">
          <a href="#" class="fsoc">ig</a>
          <a href="#" class="fsoc">fb</a>
          <a href="#" class="fsoc">tw</a>
          <a href="#" class="fsoc">yt</a>
        </div>
      </div>
      <div class="footer-col">
        <div class="footer-col-title">Collection</div>
        <ul>
          <li><a href="#">Nouveautés</a></li>
          <li><a href="#">Vestes & Manteaux</a></li>
          <li><a href="#">Chemises</a></li>
          <li><a href="#">Pantalons</a></li>
          <li><a href="#">Hoodies</a></li>
          <li><a href="#">Accessoires</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <div class="footer-col-title">Univers</div>
        <ul>
          <li><a href="#">Notre histoire</a></li>
          <li><a href="#">Notre ADN</a></li>
          <li><a href="#">Engagements</a></li>
          <li><a href="#">Presse</a></li>
          <li><a href="#">Collaborations</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <div class="footer-col-title">Service</div>
        <ul>
          <li><a href="#">Livraison & Retours</a></li>
          <li><a href="#">Guide des tailles</a></li>
          <li><a href="#">FAQ</a></li>
          <li><a href="#">Contact</a></li>
          <li><a href="#">Suivi de commande</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <div class="footer-col-title">Légal</div>
        <ul>
          <li><a href="#">Mentions légales</a></li>
          <li><a href="#">Confidentialité</a></li>
          <li><a href="#">CGV</a></li>
          <li><a href="#">Cookies</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span class="footer-copy">© 2025 tonú. Tous droits réservés.</span>
      <div class="footer-legal">
        <a href="#">Mentions légales</a>
        <a href="#">Confidentialité</a>
        <a href="#">CGV</a>
      </div>
    </div>
  </footer>
  `;
}

/* ── INIT ──
   CART.init() runs immediately at parse time, before any inline
   page script runs — so CART.items is always ready for renderCart().
── */
CART.init();

/**
 * Called by each page immediately after injecting buildNavHTML()
 * and buildFooterHTML() into the DOM.
 * At this point cur-dot, cur-ring, ham-btn, mob-overlay all exist.
 */
function initShared(){
  initCursor();
  initNav();
  initReveal();
  document.querySelectorAll('a,button,.pc,.size-btn,.qty-btn,.pay-opt,.ship-opt,.acc-head').forEach(el=>{
    el.addEventListener('mouseenter',()=>document.body.classList.add('cur-hover'));
    el.addEventListener('mouseleave',()=>document.body.classList.remove('cur-hover'));
  });
}
