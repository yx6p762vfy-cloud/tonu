// ═══════════════════════════════════════════
// tonú — Shared JS (cart, cursor, nav)
// ═══════════════════════════════════════════

// ── CART STATE ──
const CART = {
  items: JSON.parse(localStorage.getItem('sw_cart') || '[]'),

  save(){
    localStorage.setItem('sw_cart', JSON.stringify(this.items));
    this.updateUI();
  },

  add(product){
    const existing = this.items.find(i => i.id === product.id && i.size === product.size);
    if(existing){
      existing.qty++;
    } else {
      this.items.push({ ...product, qty: 1 });
    }
    this.save();
    this.flashBadge();
  },

  remove(id, size){
    this.items = this.items.filter(i => !(i.id === id && i.size === size));
    this.save();
  },

  updateQty(id, size, qty){
    const item = this.items.find(i => i.id === id && i.size === size);
    if(item){
      item.qty = Math.max(1, qty);
      this.save();
    }
  },

  total(){
    return this.items.reduce((s,i) => s + i.price * i.qty, 0);
  },

  count(){
    return this.items.reduce((s,i) => s + i.qty, 0);
  },

  updateUI(){
    const count = this.count();
    document.querySelectorAll('.cart-count').forEach(el => {
      el.textContent = count;
      el.style.display = count > 0 ? 'flex' : 'none';
    });
    document.querySelectorAll('.cart-btn-txt').forEach(el => {
      el.textContent = `Panier — ${count}`;
    });
  },

  flashBadge(){
    document.querySelectorAll('.fcrt, .cart-badge-wrap').forEach(el => {
      el.classList.add('pulse');
      setTimeout(() => el.classList.remove('pulse'), 400);
    });
  }
};

// ── CURSOR ──
function initCursor(){
  const cd = document.getElementById('cd');
  const cr = document.getElementById('cr');
  if(!cd || !cr) return;
  let mx=0,my=0,rx=0,ry=0;
  document.addEventListener('mousemove', e => {
    mx=e.clientX; my=e.clientY;
    cd.style.left=mx+'px'; cd.style.top=my+'px';
  });
  (function loop(){
    rx+=(mx-rx)*.1; ry+=(my-ry)*.1;
    cr.style.left=rx+'px'; cr.style.top=ry+'px';
    requestAnimationFrame(loop);
  })();
  document.querySelectorAll('button,a,.pc,.cc,.rc,.prod-card,.size-btn,.qty-btn').forEach(el => {
    el.addEventListener('mouseenter', () => document.body.classList.add('hov'));
    el.addEventListener('mouseleave', () => document.body.classList.remove('hov'));
  });
}

// ── NAV SCROLL ──
function initNav(){
  window.addEventListener('scroll', () => {
    const nav = document.getElementById('nav');
    if(nav) nav.classList.toggle('sc', scrollY > 50);
    const spg = document.getElementById('spg');
    if(spg) spg.style.transform = `scaleX(${scrollY/(document.body.scrollHeight-innerHeight)})`;
  }, {passive:true});
}

// ── REVEAL ──
function initReveal(){
  const obs = new IntersectionObserver(e => e.forEach(x => {
    if(x.isIntersecting) x.target.classList.add('vis');
  }), {threshold:.06});
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

// ── TOAST ──
function showToast(msg, type='success'){
  const t = document.createElement('div');
  t.className = `sw-toast ${type}`;
  t.innerHTML = `<span class="toast-icon">${type==='success'?'✓':'✕'}</span><span>${msg}</span>`;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(()=>t.remove(),400); }, 3000);
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  initCursor();
  initNav();
  initReveal();
  CART.updateUI();
});

// ── PRODUCTS DATA — source unique de vérité pour toutes les pages ──
const PRODUCTS = [
  {
    id:'p1', name:'Veste Kente Street-Tailoring', cat:'Veste Signature',
    price:7000,
    color:'#1E3D2F', bgGradient:'linear-gradient(160deg,rgba(30,61,47,.9),rgba(8,20,16,.96))',
    clothColor:'#D4A84B', clothClass:'c1', pvClass:'pv1',
    sizes:['XS','S','M','L','XL'],
    desc:'Une veste d\'exception inspirée du tissage Kente. Coupe street-tailoring moderne sur tissu structuré, motifs wax intégrés en contraste. Doublure satinée dorée.',
    image:'images/1.jpeg'
  },
  {
    id:'p2', name:'Chemise Sable & Motifs', cat:'Chemise',
    price:7000,
    color:'#4D3018', bgGradient:'linear-gradient(160deg,rgba(42,26,8,.9),rgba(77,48,24,.95))',
    clothColor:'#EFE8D8', clothClass:'c2', pvClass:'pv2',
    sizes:['S','M','L'],
    desc:'Chemise oversize en coton sable léger. Broderies traditionnelles en fil d\'or sur col et poignets. Une pièce entre héritage et modernité.',
    image:'images/2.jpeg'
  },
  {
    id:'p3', name:'Pantalon Oversize Forêt', cat:'Pantalon',
    price:3500,
    color:'#1A1A38', bgGradient:'linear-gradient(160deg,rgba(12,12,28,.9),rgba(26,26,56,.95))',
    clothColor:'#3D6E56', clothClass:'c3', pvClass:'pv3',
    sizes:['34','36','38','40','42','44'],
    desc:'Pantalon large en sergé épais vert forêt. Coupe architecturale avec pinces marquées. Taille élastiquée au dos pour un confort total.',
    image:'images/3.jpeg'
  },
  {
    id:'p4', name:'Hoodie Heritage Dark', cat:'Hoodie',
    price:8000,
    color:'#3A2210', bgGradient:'linear-gradient(160deg,rgba(30,18,8,.9),rgba(58,34,16,.95))',
    clothColor:'#4D3018', clothClass:'c4', pvClass:'pv4',
    sizes:['XS','S','M','L','XL','XXL'],
    desc:'Hoodie en molleton premium 380g. Patch brodé tonú en or sur la poitrine. Hood ajusté, poche kangourou renforcée.',
    image:'images/2.jpeg'
  },
  {
    id:'p5', name:'Set Gold Edition', cat:'Ensemble',
    price:2500,
    color:'#2D5240', bgGradient:'linear-gradient(160deg,rgba(45,82,64,.9),rgba(30,61,47,.95))',
    clothColor:'#EDD98A', clothClass:'c5', pvClass:'pv5',
    sizes:['S','M','L','XL'],
    desc:'Ensemble deux pièces collector — veste courte et pantalon cargo. Tissu gabardine traité déperlant. Finitions or brossé sur tous les détails.',
    image:'images/3.jpeg'
  },
];

// ── Helpers exposés pour les autres pages ──
// Retourne la couleur de fond (rgba) pour un produit donné (par index)
function getProductBg(idx){
  const bgs = [
    'rgba(30,61,47,.88)','rgba(42,26,8,.88)',
    'rgba(12,12,28,.88)','rgba(30,18,8,.88)','rgba(45,82,64,.88)'
  ];
  return bgs[idx] || bgs[0];
}
// Retourne la couleur tissu pour un produit donné (par index)
function getProductCloth(idx){
  const cloths = ['#D4A84B','#EFE8D8','#3D6E56','#4D3018','#EDD98A'];
  return cloths[idx] || cloths[0];
}
