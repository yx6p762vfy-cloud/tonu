#!/usr/bin/env node
process.env.SEED_DEMO = 'false';
process.env.ADMIN_EMAIL = '';
process.env.ADMIN_PASSWORD = '';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const bcrypt = require('bcryptjs');
const config = require('../server/config');
const db = require('../server/db');
const storage = require('../server/lib/storage');
const validation = require('../server/lib/validation');

const ROOT = path.join(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'public', 'images');
const OUTPUT_DIR = path.join(ROOT, 'seed-output');
const CSV_PATH = path.join(OUTPUT_DIR, 'seed-accounts.csv');
const EXECUTE = process.argv.includes('--execute');
const CLEANUP = process.argv.includes('--cleanup');

const CITIES = [
  { name: 'Paris', lang: 'fr', local: { fr: 'Paris' } },
  { name: 'New York', lang: 'en', local: { en: 'New York' } },
  { name: 'Milan', lang: 'it', local: { it: 'Milano' } },
  { name: 'Grenoble', lang: 'fr', local: { fr: 'Grenoble' } },
  { name: 'Nantes', lang: 'fr', local: { fr: 'Nantes' } },
  { name: 'Londres', lang: 'en', local: { en: 'London' } },
  { name: 'Los Angeles', lang: 'en', local: { en: 'Los Angeles' } },
  { name: 'Marseille', lang: 'fr', local: { fr: 'Marseille' } },
  { name: 'Madrid', lang: 'es', local: { es: 'Madrid' } },
  { name: 'Toulouse', lang: 'fr', local: { fr: 'Toulouse' } },
  { name: 'Lyon', lang: 'fr', local: { fr: 'Lyon' } },
  { name: 'Berlin', lang: 'de', local: { de: 'Berlin' } },
  { name: 'Munich', lang: 'de', local: { de: 'München' } },
  { name: 'Montpellier', lang: 'fr', local: { fr: 'Montpellier' } },
  { name: 'Liverpool', lang: 'en', local: { en: 'Liverpool' } },
  { name: 'Dublin', lang: 'en', local: { en: 'Dublin' } },
  { name: 'Cork', lang: 'en', local: { en: 'Cork' } },
  { name: 'Genève', lang: 'fr', local: { fr: 'Genève' } },
  { name: 'Lisbonne', lang: 'pt', local: { pt: 'Lisboa' } },
  { name: 'Montréal', lang: 'fr', local: { fr: 'Montréal' } },
  { name: 'Houston', lang: 'en', local: { en: 'Houston' } },
];

const COPY = {
  fr: {
    Rencontre: {
      titles: [
        'Rencontre complice à {city}',
        'Une vraie connexion à {city}',
        'Nouvelle rencontre, belle complicité',
        'À la recherche d’une personne sincère',
      ],
      descs: [
        'Je m’appelle {pseudo}, j’ai {age} ans et je vis à {city}. J’aime les échanges simples et respectueux, sans pression. Si le courant passe, nous prendrons le temps de faire connaissance. Répondez en commentaire, je vous lirai avec attention.',
        'Nouvelle à {city}, je cherche une rencontre authentique avec une personne majeure et bienveillante. Mes photos sont récentes. Discutons d’abord ici pour voir si nos envies se rejoignent.',
        'J’ai {age} ans et je suis basée à {city}. Disponible pour un café, une promenade ou une soirée tranquille. Le respect et la discrétion sont essentiels pour moi. Écrivez-moi en commentaire.',
      ],
    },
    Sortie: {
      titles: [
        'Sortie élégante à {city}',
        'Un verre, une balade, qui sait ?',
        'Dîner et conversation à {city}',
        'Accompagnement pour une soirée',
      ],
      descs: [
        'Je vous accompagne volontiers pour un dîner, un événement ou une sortie à {city}. Présentation soignée, conversation agréable et discrétion. Proposez-moi votre idée en commentaire.',
        'Envie d’une soirée sans prise de tête ? Je suis disponible pour un verre ou une balade à {city}. Ambiance élégante et respectueuse. Strictement entre adultes.',
        'Sorties, restaurants ou concerts : je cherche quelqu’un de disponible et respectueux pour partager un bon moment à {city}. Je réponds aux commentaires.',
      ],
    },
    Escorte: {
      titles: [
        'Compagnie élégante et discrète',
        'Escorte de charme à {city}',
        'Moments privés, discrétion absolue',
        'Accompagnement haut de gamme à {city}',
      ],
      descs: [
        'Je vous accompagne pour vos soirées, dîners ou déplacements à {city}. Ambiance élégante, respect et discrétion absolue. Je réponds aux commentaires pour convenir des détails. Strictement entre adultes consentants.',
        'Compagnie agréable et discrète à {city}, pour un événement, un dîner ou un moment privé. Photos récentes. Présentez-vous en commentaire, je réponds avec discrétion.',
        'Escorte de charme basée à {city}. Soirées, accompagnement et moments complices dans le respect de chacun. Aucune pression, uniquement des rencontres entre adultes consentants.',
      ],
    },
  },
  en: {
    Rencontre: {
      titles: [
        'Looking for a genuine connection in {city}',
        'New in town, open to meeting someone real',
        'Good conversation and real chemistry',
        'A simple, respectful date in {city}',
      ],
      descs: [
        'I’m {pseudo}, {age}, based in {city}. I value easy conversation, honesty and respect. If we click, we can take our time getting to know each other. Leave a comment and I’ll reply.',
        'New to {city} and looking for an authentic date with a kind, consenting adult. My photos are recent. Let’s talk here first and see if we’re on the same page.',
        '{age} years old, living in {city}. Available for coffee, a walk or a relaxed evening. Respect and discretion matter to me. Message me in the comments.',
      ],
    },
    Sortie: {
      titles: [
        'Elegant evening out in {city}',
        'Drinks, a walk, and good company',
        'Dinner and conversation in {city}',
        'Looking for a plus-one for the evening',
      ],
      descs: [
        'Happy to join you for dinner, an event or a night out in {city}. Smart company, good conversation and discretion. Share your idea in the comments.',
        'Looking for a relaxed evening out in {city} — drinks, a walk or live music. Elegant, respectful and strictly adults only.',
        'Dinners, concerts or city walks: I’m looking for someone available and respectful to share a good time in {city}. I reply to comments.',
      ],
    },
    Escorte: {
      titles: [
        'Elegant and discreet companionship',
        'Charming escort in {city}',
        'Private moments, absolute discretion',
        'Upscale accompaniment in {city}',
      ],
      descs: [
        'Available for evenings, dinners and travel in {city}. Elegant company, respect and absolute discretion. Comment to arrange the details. Adults only, always consensual.',
        'Pleasant and discreet companionship in {city}, for an event, a dinner or private time. Recent photos. Introduce yourself in the comments and I’ll reply discreetly.',
        'Charming escort based in {city}. Evenings, companionship and private moments with mutual respect. No pressure — consenting adults only.',
      ],
    },
  },
  es: {
    Rencontre: {
      titles: [
        'Encuentro sincero en {city}',
        'Busco una conexión real en {city}',
        'Nueva en la ciudad, ganas de conocer',
        'Una cita tranquila y respetuosa',
      ],
      descs: [
        'Me llamo {pseudo}, tengo {age} años y vivo en {city}. Busco un encuentro auténtico con una persona adulta y respetuosa. Si congeniamos, nos conoceremos sin prisa. Escríbeme en los comentarios.',
        'Soy nueva en {city} y me gustaría conocer a alguien sincero. Mis fotos son recientes. Hablemos primero por aquí para ver si encajamos.',
        'Tengo {age} años y estoy en {city}. Disponible para un café, un paseo o una noche tranquila. Respeto y discreción. Déjame un comentario.',
      ],
    },
    Sortie: {
      titles: [
        'Salida elegante en {city}',
        'Una copa, un paseo, buena compañía',
        'Cena y conversación en {city}',
        'Acompañante para una noche especial',
      ],
      descs: [
        'Te acompaño encantada a una cena, un evento o una salida en {city}. Buena presencia, conversación agradable y discreción. Propón tu plan en los comentarios.',
        '¿Te apetece una noche sin complicaciones? Estoy disponible para una copa o un paseo por {city}. Ambiente elegante y respetuoso. Solo adultos.',
        'Cenas, conciertos o paseos: busco a alguien disponible y respetuoso para compartir un buen momento en {city}. Respondo a los comentarios.',
      ],
    },
    Escorte: {
      titles: [
        'Compañía elegante y discreta',
        'Escort de lujo en {city}',
        'Momentos privados con discreción',
        'Acompañamiento exclusivo en {city}',
      ],
      descs: [
        'Te acompaño en tus noches, cenas o viajes en {city}. Elegancia, respeto y discreción absoluta. Respondo a los comentarios para concretar. Solo adultos que consienten.',
        'Compañía agradable y discreta en {city}, para un evento, una cena o un momento privado. Fotos recientes. Preséntate en los comentarios y te responderé con discreción.',
        'Escort de charme en {city}. Noches, compañía y momentos cómplices con respeto mutuo. Sin presiones, solo adultos que consienten.',
      ],
    },
  },
  de: {
    Rencontre: {
      titles: [
        'Ehrliche Begegnung in {city}',
        'Auf der Suche nach einer echten Verbindung',
        'Neu in der Stadt, offen für ein Kennenlernen',
        'Ein entspanntes, respektvolles Date',
      ],
      descs: [
        'Ich heiße {pseudo}, bin {age} Jahre alt und lebe in {city}. Ich suche eine ehrliche Begegnung mit einem respektvollen Erwachsenen. Wenn es passt, nehmen wir uns Zeit. Schreib mir in den Kommentaren.',
        'Neu in {city} und offen für ein echtes Kennenlernen. Meine Fotos sind aktuell. Lass uns zuerst hier sprechen und sehen, ob es passt.',
        '{age} Jahre alt, in {city} zu Hause. Verfügbar für einen Kaffee, einen Spaziergang oder einen ruhigen Abend. Respekt und Diskretion sind mir wichtig. Hinterlasse einen Kommentar.',
      ],
    },
    Sortie: {
      titles: [
        'Elegante Abendbegleitung in {city}',
        'Ein Drink, ein Spaziergang, gute Gesellschaft',
        'Dinner und gute Gespräche in {city}',
        'Begleitung für einen besonderen Abend',
      ],
      descs: [
        'Ich begleite dich gern zu einem Dinner, einer Veranstaltung oder einem Abend in {city}. Gepflegtes Auftreten, gute Gespräche und Diskretion. Schlage deine Idee in den Kommentaren vor.',
        'Lust auf einen entspannten Abend in {city}? Ich bin für einen Drink oder einen Spaziergang verfügbar. Elegant, respektvoll und nur für Erwachsene.',
        'Dinner, Konzerte oder Stadtspaziergänge: Ich suche jemanden, der verfügbar und respektvoll ist, um in {city} eine schöne Zeit zu teilen. Ich antworte auf Kommentare.',
      ],
    },
    Escorte: {
      titles: [
        'Elegante und diskrete Begleitung',
        'Charmante Escort-Dame in {city}',
        'Private Momente, absolute Diskretion',
        'Exklusive Begleitung in {city}',
      ],
      descs: [
        'Ich begleite dich bei Abenden, Dinners oder Reisen in {city}. Eleganz, Respekt und absolute Diskretion. Antworte auf meine Kommentare, um Details zu klären. Nur einvernehmliche Erwachsene.',
        'Angenehme und diskrete Begleitung in {city}, für eine Veranstaltung, ein Dinner oder private Zeit. Aktuelle Fotos. Stelle dich in den Kommentaren vor, ich antworte diskret.',
        'Charmante Escort-Dame in {city}. Abende, Begleitung und private Momente mit gegenseitigem Respekt. Kein Druck, nur einvernehmliche Erwachsene.',
      ],
    },
  },
  pt: {
    Rencontre: {
      titles: [
        'Encontro sincero em {city}',
        'À procura de uma ligação verdadeira',
        'Nova na cidade, aberta a conhecer alguém',
        'Um encontro tranquilo e respeitoso',
      ],
      descs: [
        'Chamo-me {pseudo}, tenho {age} anos e vivo em {city}. Procuro um encontro sincero com um adulto respeitoso. Se houver química, conhecemo-nos sem pressa. Escreve nos comentários.',
        'Sou nova em {city} e gostaria de conhecer alguém genuíno. As minhas fotos são recentes. Vamos falar primeiro por aqui para ver se combinamos.',
        'Tenho {age} anos e estou em {city}. Disponível para um café, um passeio ou uma noite tranquila. Respeito e discrição são essenciais. Deixa um comentário.',
      ],
    },
    Sortie: {
      titles: [
        'Saída elegante em {city}',
        'Um copo, um passeio, boa companhia',
        'Jantar e conversa em {city}',
        'Acompanhante para uma noite especial',
      ],
      descs: [
        'Acompanho-te com prazer a um jantar, evento ou saída em {city}. Boa apresentação, conversa agradável e discrição. Sugere o teu plano nos comentários.',
        'Apetece-te uma noite sem complicações? Estou disponível para um copo ou um passeio em {city}. Ambiente elegante e respeitoso. Apenas adultos.',
        'Jantares, concertos ou passeios: procuro alguém disponível e respeitoso para partilhar um bom momento em {city}. Respondo aos comentários.',
      ],
    },
    Escorte: {
      titles: [
        'Companhia elegante e discreta',
        'Acompanhante de charme em {city}',
        'Momentos privados com discrição',
        'Acompanhamento exclusivo em {city}',
      ],
      descs: [
        'Acompanho-te nas tuas noites, jantares ou viagens em {city}. Elegância, respeito e discrição absoluta. Respondo aos comentários para combinar. Apenas adultos que consentem.',
        'Companhia agradável e discreta em {city}, para um evento, um jantar ou um momento privado. Fotos recentes. Apresenta-te nos comentários e respondo com discrição.',
        'Acompanhante de charme em {city}. Noites, companhia e momentos cúmplices com respeito mútuo. Sem pressão, apenas adultos que consentem.',
      ],
    },
  },
  it: {
    Rencontre: {
      titles: [
        'Incontro sincero a {city}',
        'Cerco un legame autentico',
        'Nuova in città, voglia di conoscere',
        'Un appuntamento tranquillo e rispettoso',
      ],
      descs: [
        'Mi chiamo {pseudo}, ho {age} anni e vivo a {city}. Cerco un incontro sincero con un adulto rispettoso. Se c’è feeling, ci conosceremo senza fretta. Scrivi nei commenti.',
        'Sono nuova a {city} e vorrei conoscere qualcuno autentico. Le mie foto sono recenti. Parliamo prima qui per capire se siamo in sintonia.',
        'Ho {age} anni e sono a {city}. Disponibile per un caffè, una passeggiata o una serata tranquilla. Rispetto e discrezione sono essenziali. Lasciami un commento.',
      ],
    },
    Sortie: {
      titles: [
        'Serata elegante a {city}',
        'Un drink, una passeggiata, buona compagnia',
        'Cena e conversazione a {city}',
        'Accompagnamento per una serata speciale',
      ],
      descs: [
        'Ti accompagno volentieri a una cena, un evento o una serata a {city}. Bella presenza, conversazione piacevole e discrezione. Proponi la tua idea nei commenti.',
        'Voglia di una serata senza pensieri? Sono disponibile per un drink o una passeggiata a {city}. Ambiente elegante e rispettoso. Solo adulti.',
        'Cene, concerti o passeggiate: cerco qualcuno disponibile e rispettoso per condividere un bel momento a {city}. Rispondo ai commenti.',
      ],
    },
    Escorte: {
      titles: [
        'Compagnia elegante e discreta',
        'Escort di charme a {city}',
        'Momenti privati, discrezione assoluta',
        'Accompagnamento esclusivo a {city}',
      ],
      descs: [
        'Ti accompagno nelle tue serate, cene o viaggi a {city}. Eleganza, rispetto e discrezione assoluta. Rispondo ai commenti per organizzare. Solo adulti consenzienti.',
        'Compagnia piacevole e discreta a {city}, per un evento, una cena o un momento privato. Foto recenti. Presentati nei commenti e risponderò con discrezione.',
        'Escort di charme a {city}. Serate, compagnia e momenti complici nel rispetto reciproco. Nessuna pressione, solo adulti consenzienti.',
      ],
    },
  },
};

function hash32(value, salt = '') {
  return crypto.createHash('sha256').update(`${salt}:${value}`).digest().readUInt32BE(0);
}

function slugify(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function prettify(value) {
  return String(value)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, prefix, letter) => prefix + letter.toUpperCase())
    .slice(0, 32);
}

function fill(text, vars) {
  return text.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

function readGroups() {
  const entries = fs.readdirSync(IMAGES_DIR);
  const groups = new Map();
  for (const file of entries) {
    const match = file.match(/^(.*) \(([12])\)\.jpeg$/i);
    if (!match) continue;
    const base = match[1];
    if (!groups.has(base)) groups.set(base, {});
    groups.get(base)[Number(match[2])] = file;
  }
  const complete = [];
  const incomplete = [];
  for (const [base, files] of groups) {
    if (files[1] && files[2]) complete.push({ base, files: [files[1], files[2]] });
    else incomplete.push({ base, files });
  }
  return { complete, incomplete };
}

function buildPlan(groups) {
  const ordered = [...groups].sort((a, b) => hash32(a.base) - hash32(b.base));
  const accounts = ordered.map((group, index) => {
    const slug = slugify(group.base);
    const pseudo = prettify(group.base);
    const city = CITIES[index % CITIES.length];
    return {
      slug,
      pseudo,
      city,
      index,
      age: 21 + (hash32(group.base, 'age') % 16),
      files: group.files,
      email: `${slug}@seed.tonu.local`,
      id: `seed-${slug}`,
    };
  });

  const categorySlots = new Array(accounts.length).fill(null);
  const firstPerCity = new Map();
  accounts.forEach((account, index) => {
    if (!firstPerCity.has(account.city.name)) {
      firstPerCity.set(account.city.name, index);
      categorySlots[index] = 'Escorte';
    }
  });

  const remaining = [];
  const count = (cat) => categorySlots.filter((c) => c === cat).length;
  for (let i = count('Escorte'); i < 45; i += 1) remaining.push('Escorte');
  for (let i = count('Rencontre'); i < 20; i += 1) remaining.push('Rencontre');
  for (let i = count('Sortie'); i < 15; i += 1) remaining.push('Sortie');
  remaining.sort((a, b) => hash32(a, 'cat') - hash32(b, 'cat'));

  let cursor = 0;
  accounts.forEach((account, index) => {
    if (categorySlots[index]) return;
    categorySlots[index] = remaining[cursor];
    cursor += 1;
  });

  const now = Date.now();
  const usedTitles = new Set();
  accounts.forEach((account, index) => {
    const category = categorySlots[index];
    const lang = account.city.lang;
    const copy = COPY[lang][category];
    const titleSeed = hash32(account.slug, 'title');
    const descSeed = hash32(account.slug, 'desc');
    const localCity = account.city.local[lang] || account.city.name;
    const vars = { pseudo: account.pseudo, age: account.age, city: localCity };
    let title = fill(copy.titles[titleSeed % copy.titles.length], vars);
    if (usedTitles.has(title.toLowerCase())) title = `${title} — ${account.pseudo}`;
    usedTitles.add(title.toLowerCase());
    const description = fill(copy.descs[descSeed % copy.descs.length], vars);
    account.category = category;
    account.lang = lang;
    account.localCity = localCity;
    account.title = title;
    account.description = description;
    account.intention = category === 'Sortie' ? 'Sorties' : category === 'Escorte' ? 'Escorte' : titleSeed % 2 ? 'Rencontre sérieuse' : 'Rencontre';
    const minutesAgo = 360 + index * 311 + (descSeed % 180);
    account.adCreatedAt = new Date(now - minutesAgo * 60 * 1000);
    account.userCreatedAt = new Date(account.adCreatedAt.getTime() - 2 * 24 * 60 * 60 * 1000);
    account.photoNames = [`seed-${account.slug}-1.jpg`, `seed-${account.slug}-2.jpg`];
  });

  return accounts;
}

function validatePlan(accounts) {
  const problems = [];
  const seen = new Set();
  for (const account of accounts) {
    if (!validation.pseudo(account.pseudo)) problems.push(`${account.slug}: pseudo invalide « ${account.pseudo} »`);
    if (!validation.title(account.title)) problems.push(`${account.slug}: titre invalide`);
    if (!validation.description(account.description)) problems.push(`${account.slug}: description invalide`);
    if (!validation.city(account.city.name)) problems.push(`${account.slug}: ville invalide`);
    if (!validation.oneOf(account.category, validation.CATEGORIES)) problems.push(`${account.slug}: catégorie invalide`);
    if (!validation.oneOf(account.intention, validation.INTENTIONS)) problems.push(`${account.slug}: intention invalide`);
    for (const value of [account.id, account.email, account.pseudo.toLowerCase()]) {
      if (seen.has(value)) problems.push(`${account.slug}: doublon ${value}`);
      seen.add(value);
    }
    const photo1 = path.join(IMAGES_DIR, account.files[0]);
    const photo2 = path.join(IMAGES_DIR, account.files[1]);
    for (const file of [photo1, photo2]) {
      if (!fs.existsSync(file)) problems.push(`${account.slug}: photo absente ${path.basename(file)}`);
    }
  }
  return problems;
}

function summarize(accounts) {
  const countBy = (key) => {
    const map = {};
    for (const account of accounts) {
      const value = key(account);
      map[value] = (map[value] || 0) + 1;
    }
    return map;
  };
  return {
    total: accounts.length,
    categories: countBy((a) => a.category),
    languages: countBy((a) => a.lang),
    cities: countBy((a) => a.city.name),
    intentions: countBy((a) => a.intention),
  };
}

async function processAndUpload(source, destination) {
  const image = sharp(source, { limitInputPixels: 50_000_000 });
  const meta = await image.metadata();
  if (!meta.width || !meta.height || meta.width < 200 || meta.height < 200) {
    throw new Error(`Image invalide ou trop petite : ${path.basename(source)}`);
  }
  const buffer = await image
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  await storage.putObject(destination, buffer);
  return buffer.length;
}

async function uploadWithLimit(items, limit, worker) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await worker(item);
    }
  });
  await Promise.all(workers);
}

function csvEscape(value) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function ensureCsvHeader() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(CSV_PATH)) {
    fs.writeFileSync(CSV_PATH, 'pseudo,email,password,city,category,ad_id\n');
  }
}

function appendCsv(row) {
  ensureCsvHeader();
  fs.appendFileSync(
    CSV_PATH,
    [row.pseudo, row.email, row.password, row.city, row.category, row.adId].map(csvEscape).join(',') + '\n'
  );
}

async function cleanup(accounts) {
  await db.init();
  const { changes } = await db.run("DELETE FROM users WHERE id LIKE 'seed-%'");
  const names = accounts.flatMap((account) => account.photoNames);
  await storage.deleteObjects(names).catch(() => {});
  console.log(`Suppression terminée : ${changes} comptes seed, ${names.length} fichiers photo demandés.`);
  await db.close();
}

async function seed(accounts) {
  if (!config.databaseUrl) throw new Error('DATABASE_URL absent : le seed de production est annulé.');
  if (!config.storageConfigured()) throw new Error('Supabase Storage non configuré : impossible d’envoyer les photos.');

  await db.init();
  await storage.ensureBucket();

  const existing = await db.all(
    "SELECT id, email, pseudo FROM users WHERE id LIKE 'seed-%' OR email LIKE '%@seed.tonu.local'"
  );
  const existingIds = new Set(existing.map((row) => row.id));
  const existingEmails = new Set(existing.map((row) => row.email.toLowerCase()));
  const existingAds = new Set(
    (await db.all("SELECT id FROM annonces WHERE id LIKE 'seed-%'")).map((row) => row.id)
  );

  for (const account of accounts) {
    const hasUser = existingIds.has(account.id) || existingEmails.has(account.email);
    const hasAd = existingAds.has(account.id);
    if (hasUser !== hasAd) {
      throw new Error(
        `État partiel pour ${account.slug} (compte: ${hasUser}, annonce: ${hasAd}). Lance --cleanup --execute puis relance --execute.`
      );
    }
    if (hasUser) continue;
    const conflict = await db.get(
      'SELECT id, email, pseudo FROM users WHERE (LOWER(email) = ? OR LOWER(pseudo) = ?) AND id <> ?',
      [account.email.toLowerCase(), account.pseudo.toLowerCase(), account.id]
    );
    if (conflict) {
      throw new Error(`Conflit pour « ${account.pseudo} » : ${conflict.email} existe déjà (${conflict.id}).`);
    }
  }

  const pending = accounts.filter(
    (account) => !existingIds.has(account.id) && !existingEmails.has(account.email)
  );
  console.log(`${pending.length} comptes à créer, ${accounts.length - pending.length} déjà présents.`);

  const uploads = pending.flatMap((account) =>
    account.files.map((file, index) => ({ source: path.join(IMAGES_DIR, file), destination: account.photoNames[index], account }))
  );
  console.log(`Traitement et envoi de ${uploads.length} photos…`);
  let uploaded = 0;
  let uploadedBytes = 0;
  await uploadWithLimit(uploads, 4, async (item) => {
    uploadedBytes += await processAndUpload(item.source, item.destination);
    uploaded += 1;
    if (uploaded % 20 === 0) console.log(`  ${uploaded}/${uploads.length} photos`);
  });
  console.log(`Photos envoyées : ${uploaded} (${(uploadedBytes / 1024 / 1024).toFixed(1)} Mo traités).`);

  let created = 0;
  for (const account of pending) {
    const password = crypto.randomBytes(12).toString('base64url');
    const passwordHash = bcrypt.hashSync(password, 12);
    await db.tx(async (t) => {
      await t.run(
        `INSERT INTO users (id, email, password_hash, pseudo, age, role, plan, premium_until, banned, terms_accepted_at, terms_version, created_at)
         VALUES (?, ?, ?, ?, ?, 'user', 'golden', now() + interval '1 year', false, now(), ?, ?)`,
        [account.id, account.email, passwordHash, account.pseudo, account.age, config.termsVersion, account.userCreatedAt]
      );
      await t.run(
        `INSERT INTO annonces (id, user_id, title, description, city, category, intention, gender, status, created_at, moderated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Femme', 'approved', ?, now())`,
        [
          account.id,
          account.id,
          account.title,
          account.description,
          account.city.name,
          account.category,
          account.intention,
          account.adCreatedAt,
        ]
      );
      for (let i = 0; i < account.photoNames.length; i += 1) {
        await t.run('INSERT INTO annonce_photos (id, annonce_id, file_name, sort_order) VALUES (?, ?, ?, ?)', [
          `${account.id}-ph${i + 1}`,
          account.id,
          account.photoNames[i],
          i,
        ]);
      }
    });
    appendCsv({
      pseudo: account.pseudo,
      email: account.email,
      password,
      city: account.city.name,
      category: account.category,
      adId: account.id,
    });
    created += 1;
    if (created % 10 === 0) console.log(`  ${created}/${pending.length} comptes créés`);
  }

  console.log(`Terminé : ${created} comptes et annonces créés, ${accounts.length} au total dans le plan.`);
  console.log(`Identifiants : ${CSV_PATH}`);
  await db.close();
}

(async () => {
  const { complete, incomplete } = readGroups();
  if (incomplete.length) {
    console.log(`Paires incomplètes ignorées : ${incomplete.map((item) => item.base).join(', ')}`);
  }
  if (!complete.length) throw new Error('Aucune paire d’images trouvée dans public/images.');
  const accounts = buildPlan(complete);
  const summary = summarize(accounts);
  console.log('Plan de seed :');
  console.log(JSON.stringify(summary, null, 2));
  for (const account of accounts.slice(0, 5)) {
    console.log(`- ${account.pseudo} · ${account.city.name} · ${account.category} · ${account.title}`);
  }
  const problems = validatePlan(accounts);
  if (problems.length) {
    console.error('Validation échouée :');
    for (const problem of problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log('Validation du plan : OK');

  if (CLEANUP) {
    if (!EXECUTE) {
      console.log('Mode simulation : ajoute --execute pour supprimer réellement les comptes seed.');
      return;
    }
    await cleanup(accounts);
    return;
  }

  if (!EXECUTE) {
    console.log('Mode simulation : aucune écriture. Ajoute --execute pour créer les comptes et annonces.');
    return;
  }

  await seed(accounts);
})().catch((err) => {
  console.error(`Erreur : ${err.message}`);
  process.exitCode = 1;
});
