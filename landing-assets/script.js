const menuButton = document.querySelector('.menu-toggle');
const mainNav = document.querySelector('.main-nav');

menuButton?.addEventListener('click', function () {
  const open = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!open));
  menuButton.setAttribute('aria-label', open ? 'Abrir menú' : 'Cerrar menú');
  mainNav?.classList.toggle('is-open', !open);
});

mainNav?.querySelectorAll('a').forEach(function (link) {
  link.addEventListener('click', function () {
    menuButton?.setAttribute('aria-expanded', 'false');
    mainNav.classList.remove('is-open');
  });
});

document.querySelectorAll('a[href="#inicio"]').forEach(function (link) {
  link.addEventListener('click', function (event) {
    event.preventDefault();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  });
});

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });
  document.querySelectorAll('.reveal').forEach(function (element) { observer.observe(element); });
} else {
  document.querySelectorAll('.reveal').forEach(function (element) { element.classList.add('is-visible'); });
}

function addParticles(container, total) {
  if (!container || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const darkField = container.classList.contains('micro-particles');
  const lightColors = ['#08576e', '#552676', '#4c7261', '#974d39'];
  const darkColors = ['#ffffff', '#a7dbe6', '#d1b6df', '#f7f5ef'];
  const palette = darkField ? darkColors : lightColors;
  for (let index = 0; index < total; index += 1) {
    const particle = document.createElement('span');
    particle.style.left = String(1 + Math.random() * 98) + '%';
    particle.style.top = String(1 + Math.random() * 98) + '%';
    particle.style.setProperty('--x', String(-54 + Math.random() * 108) + 'px');
    particle.style.setProperty('--y', String(-72 + Math.random() * 144) + 'px');
    particle.style.setProperty('--x2', String(-82 + Math.random() * 164) + 'px');
    particle.style.setProperty('--y2', String(-64 + Math.random() * 128) + 'px');
    particle.style.setProperty('--x3', String(-96 + Math.random() * 192) + 'px');
    particle.style.setProperty('--y3', String(-82 + Math.random() * 164) + 'px');
    particle.style.setProperty('--duration', String(12 + Math.random() * 17) + 's');
    particle.style.setProperty('--particle-size', String(1.4 + Math.random() * 2.2) + 'px');
    particle.style.setProperty('--particle-opacity', String((darkField ? .28 : .24) + Math.random() * .28));
    particle.style.setProperty('--particle-color', palette[Math.floor(Math.random() * palette.length)]);
    particle.style.animationDelay = String(-Math.random() * 22) + 's';
    container.appendChild(particle);
  }
}

const particleScale = window.innerWidth < 821 ? .54 : 1;
document.querySelectorAll('.particle-field').forEach(function (node) { addParticles(node, Math.round(640 * particleScale)); });
document.querySelectorAll('.micro-particles').forEach(function (node) { addParticles(node, Math.round(310 * particleScale)); });
document.querySelectorAll('.section-particles').forEach(function (node) { addParticles(node, Math.round(430 * particleScale)); });

const parallaxItems = Array.from(document.querySelectorAll('[data-parallax]'));
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let parallaxFrame = 0;

function updateParallax() {
  parallaxFrame = 0;
  if (reducedMotion.matches) {
    parallaxItems.forEach(function (item) { item.style.removeProperty('--parallax-y'); });
    return;
  }
  const viewportHeight = window.innerHeight;
  const mobileFactor = window.innerWidth < 821 ? .45 : 1;
  parallaxItems.forEach(function (item) {
    const rect = item.getBoundingClientRect();
    if (rect.bottom < -200 || rect.top > viewportHeight + 200) return;
    const center = rect.top + rect.height / 2;
    const progress = (viewportHeight / 2 - center) / viewportHeight;
    const distance = Number(item.dataset.parallax) || 20;
    const shift = Math.max(-distance, Math.min(distance, progress * distance * 2)) * mobileFactor;
    item.style.setProperty('--parallax-y', shift.toFixed(2) + 'px');
  });
}

function queueParallax() {
  if (parallaxFrame) return;
  parallaxFrame = window.requestAnimationFrame(updateParallax);
}

window.addEventListener('scroll', queueParallax, { passive: true });
window.addEventListener('resize', queueParallax);
queueParallax();

const marketTrigger = document.querySelector('.market-trigger');
const marketMenu = document.querySelector('#market-menu');

function closeMarketMenu() {
  if (!marketMenu || !marketTrigger) return;
  marketMenu.hidden = true;
  marketTrigger.setAttribute('aria-expanded', 'false');
}

marketTrigger?.addEventListener('click', function () {
  if (!marketMenu) return;
  const willOpen = marketMenu.hidden;
  marketMenu.hidden = !willOpen;
  marketTrigger.setAttribute('aria-expanded', String(willOpen));
});

function selectMarket(code, country, flag) {
  const codeNode = document.querySelector('.market-code');
  const nameNode = document.querySelector('.market-name');
  const flagNode = document.querySelector('.market-flag');
  if (codeNode) codeNode.textContent = code;
  if (nameNode) nameNode.textContent = country;
  if (flagNode) flagNode.textContent = flag;
  const formCountry = document.querySelector('#availability-form select[name="country"]');
  if (formCountry && Array.from(formCountry.options).some(function (option) { return option.value === country; })) {
    formCountry.value = country;
  }
  closeMarketMenu();
}

document.querySelectorAll('#market-menu [data-code]').forEach(function (button) {
  button.addEventListener('click', function () {
    selectMarket(button.dataset.code, button.dataset.country, button.dataset.flag);
  });
});

document.addEventListener('click', function (event) {
  if (!event.target.closest('.market-picker')) closeMarketMenu();
});

const loginDialog = document.querySelector('#login-dialog');
const loginForm = document.querySelector('#login-form');
const loginResult = document.querySelector('#login-result');

document.querySelector('[data-login-open]')?.addEventListener('click', function () {
  if (!loginDialog) return;
  loginResult.textContent = '';
  loginDialog.showModal();
});

document.querySelector('[data-login-close]')?.addEventListener('click', function () {
  loginDialog?.close();
});

loginDialog?.addEventListener('click', function (event) {
  if (event.target === loginDialog) loginDialog.close();
});

loginForm?.addEventListener('submit', function (event) {
  event.preventDefault();
  if (!loginForm.checkValidity()) {
    loginForm.reportValidity();
    return;
  }
  loginResult.textContent = 'El acceso seguro se conectará al habilitar la autenticación de RADAR.';
});

const productData = {
  electoral: {
    index: 'RADAR / 01',
    title: 'RADAR Electoral',
    theme: 'electoral',
    copy: 'Para campañas y organizaciones políticas que necesitan comprender el municipio, ordenar su estructura y llegar al Día D con control.',
    features: ['Inteligencia municipal y fuentes verificadas', 'Directorio, agenda y operación territorial', 'Recursos, fiscales y Día D']
  },
  municipal: {
    index: 'RADAR / 02',
    title: 'RADAR Municipal',
    theme: 'municipal',
    copy: 'Para administraciones locales que quieren convertir demandas, compromisos y recorridos territoriales en seguimiento visible.',
    features: ['Lectura territorial', 'Prioridades y compromisos', 'Seguimiento de gestión']
  },
  government: {
    index: 'RADAR / 03',
    title: 'RADAR Gobierno',
    theme: 'government',
    copy: 'Para equipos públicos que requieren contexto, prioridades y avance operativo en una lectura ejecutiva y territorial.',
    features: ['Inteligencia institucional', 'Monitoreo territorial', 'Soporte a decisiones']
  }
};

const productDetail = document.querySelector('#product-detail');
const productDetailIndex = document.querySelector('#product-detail-index');
const productDetailTitle = document.querySelector('#product-detail-title');
const productDetailCopy = document.querySelector('#product-detail-copy');
const productDetailFeatures = document.querySelector('#product-detail-features');
const productPills = Array.from(document.querySelectorAll('.product-pill'));
let activeProduct = null;

function closeProductDetail() {
  activeProduct = null;
  productDetail?.classList.remove('is-open');
  productDetail?.setAttribute('aria-hidden', 'true');
  productDetail?.setAttribute('inert', '');
  productPills.forEach(function (pill) { pill.setAttribute('aria-expanded', 'false'); });
}

productPills.forEach(function (pill) {
  pill.addEventListener('click', function () {
    const productKey = pill.dataset.product;
    const product = productData[productKey];
    if (!product || !productDetail) return;
    if (activeProduct === productKey) {
      closeProductDetail();
      return;
    }
    activeProduct = productKey;
    productDetailIndex.textContent = product.index;
    productDetailTitle.textContent = product.title;
    productDetailCopy.textContent = product.copy;
    productDetailFeatures.innerHTML = '';
    product.features.forEach(function (feature) {
      const item = document.createElement('li');
      item.textContent = feature;
      productDetailFeatures.appendChild(item);
    });
    productDetail.dataset.theme = product.theme;
    productDetail.classList.add('is-open');
    productDetail.setAttribute('aria-hidden', 'false');
    productDetail.removeAttribute('inert');
    productPills.forEach(function (item) { item.setAttribute('aria-expanded', String(item === pill)); });
  });
});

productDetail?.querySelector('a')?.addEventListener('click', closeProductDetail);

document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape') {
    closeProductDetail();
    closeMarketMenu();
    menuButton?.setAttribute('aria-expanded', 'false');
    mainNav?.classList.remove('is-open');
  }
});

function showResult(element, message, error) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('is-error', Boolean(error));
  element.classList.add('is-visible');
}

document.querySelector('#availability-form')?.addEventListener('submit', function (event) {
  event.preventDefault();
  const form = event.currentTarget;
  const result = document.querySelector('#availability-result');
  if (!form.checkValidity()) {
    form.reportValidity();
    showResult(result, 'Completa país, región, municipio y campaña para continuar.', true);
    return;
  }
  const data = new FormData(form);
  const municipality = String(data.get('municipality')).trim();
  const region = String(data.get('region')).trim();
  const country = String(data.get('country')).trim();
  const campaign = String(data.get('campaign')).trim();
  showResult(result, municipality + ', ' + region + ', ' + country + ' · campaña ' + campaign + ': la disponibilidad se confirma de forma privada. Continúa con la solicitud de demostración para verificar el territorio.', false);
});

document.querySelector('#demo-form')?.addEventListener('submit', function (event) {
  event.preventDefault();
  const form = event.currentTarget;
  const result = document.querySelector('#demo-result');
  if (!form.checkValidity()) {
    form.reportValidity();
    showResult(result, 'Completa los campos requeridos y acepta el contacto para preparar la solicitud.', true);
    return;
  }
  showResult(result, 'Solicitud preparada. En esta revisión privada no se transmiten datos; el canal comercial se conectará antes de publicar en el dominio final.', false);
});
