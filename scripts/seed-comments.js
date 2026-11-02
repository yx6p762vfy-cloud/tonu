#!/usr/bin/env node
process.env.SEED_DEMO = 'false';
process.env.ADMIN_EMAIL = '';
process.env.ADMIN_PASSWORD = '';

const crypto = require('crypto');
const config = require('../server/config');
const db = require('../server/db');

const EXECUTE = process.argv.includes('--execute');
const CLEANUP = process.argv.includes('--cleanup');
const COMMENT_PREFIX = 'seedc-';
const REPLY_PREFIX = 'seedr-';

const CITY_LANG = {
  Paris: 'fr',
  'New York': 'en',
  Milan: 'it',
  Grenoble: 'fr',
  Nantes: 'fr',
  Londres: 'en',
  'Los Angeles': 'en',
  Marseille: 'fr',
  Madrid: 'es',
  Toulouse: 'fr',
  Lyon: 'fr',
  Berlin: 'de',
  Munich: 'de',
  Montpellier: 'fr',
  Liverpool: 'en',
  Dublin: 'en',
  Cork: 'en',
  Genève: 'fr',
  Lisbonne: 'pt',
  Montréal: 'fr',
  Houston: 'en',
};

const COMMENT_TEXTS = [
  // français
  'Bonjour, je suis intéressé. Tu es disponible ce week-end ?',
  'Tes photos sont superbes 😍',
  'Peux-tu m’en dire plus en message privé ?',
  'Disponible en soirée cette semaine ?',
  'J’adore ton style, on peut en parler ?',
  // anglais
  'Hey, are you free this weekend?',
  'You look amazing 😍',
  'Can you share more details privately?',
  'I’d love to meet you this week.',
  'Available tonight?',
  // espagnol
  'Hola, ¿estás disponible este fin de semana?',
  'Me encantan tus fotos 😍',
  '¿Puedes contarme más en privado?',
  'Me gustaría conocerte esta semana.',
  '¿Tienes hueco esta noche?',
  // allemand
  'Hallo, hast du dieses Wochenende Zeit?',
  'Deine Fotos sind wunderschön 😍',
  'Kannst du mir mehr privat schreiben?',
  'Ich würde dich diese Woche gerne treffen.',
  'Hast du heute Abend Zeit?',
  // portugais
  'Olá, estás disponível este fim de semana?',
  'As tuas fotos são lindas 😍',
  'Podes dar-me mais detalhes em privado?',
  'Gostava de te conhecer esta semana.',
  'Estás livre hoje à noite?',
  // italien
  'Ciao, sei disponibile questo fine settimana?',
  'Le tue foto sono bellissime 😍',
  'Puoi darmi più dettagli in privato?',
  'Mi piacerebbe conoscerti questa settimana.',
  'Sei libera stasera?',
];

const REPLIES = {
  fr: [
    'Merci pour ton message ! Laisse ton numéro si tu es intéressé 😉',
    'Avec plaisir — laisse ton numéro si tu es intéressé, je te réponds en privé.',
    'Merci ! Laisse ton numéro si tu es intéressé et je te contacte rapidement.',
  ],
  en: [
    'Thanks for reaching out! Leave your number if you’re interested 😉',
    'Happy to talk — leave your number if you’re interested and I’ll reply privately.',
    'Thanks! Leave your number if you’re interested and I’ll get back to you soon.',
  ],
  es: [
    '¡Gracias por escribir! Déjame tu número si estás interesado 😉',
    'Con gusto — déjame tu número si estás interesado y te escribo en privado.',
    '¡Gracias! Déjame tu número si estás interesado y te contacto pronto.',
  ],
  de: [
    'Danke für deine Nachricht! Lass mir deine Nummer da, wenn du interessiert bist 😉',
    'Gerne — lass mir deine Nummer da, wenn du interessiert bist, ich melde mich privat.',
    'Danke! Lass mir deine Nummer da, wenn du interessiert bist, ich melde mich bald.',
  ],
  pt: [
    'Obrigada pela mensagem! Deixa o teu número se estiveres interessado 😉',
    'Com muito gosto — deixa o teu número se estiveres interessado e falo contigo em privado.',
    'Obrigada! Deixa o teu número se estiveres interessado e contacto-te em breve.',
  ],
  it: [
    'Grazie per il messaggio! Lasciami il tuo numero se sei interessato 😉',
    'Volentieri — lasciami il tuo numero se sei interessato e ti scrivo in privato.',
    'Grazie! Lasciami il tuo numero se sei interessato e ti contatto presto.',
  ],
};

function hash32(value) {
  return crypto.createHash('sha256').update(String(value)).digest().readUInt32BE(0);
}

function commentCount(adId) {
  return 18 + (hash32(`${adId}:count`) % 5);
}

function pick(list, seed) {
  return list[seed % list.length];
}

function buildThread(ad, commenters, now) {
  const slug = ad.id.slice('seed-'.length);
  const count = commentCount(ad.id);
  const lang = CITY_LANG[ad.city] || 'fr';
  const adTime = new Date(ad.created_at).getTime();
  const floor = Math.max(adTime + 60 * 60 * 1000, now - 21 * 24 * 60 * 60 * 1000);
  const ceiling = now - 2 * 60 * 1000;
  const span = Math.max(ceiling - floor, 60 * 60 * 1000);
  const textOffset = hash32(`${ad.id}:text`) % COMMENT_TEXTS.length;

  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const rank = String(i + 1).padStart(2, '0');
    const commentId = `${COMMENT_PREFIX}${slug}-${rank}`;
    const replyId = `${REPLY_PREFIX}${slug}-${rank}`;

    const commentAt = floor + Math.round((span * (i + 1)) / (count + 1));
    const replyDelay = (5 + (hash32(`${replyId}:delay`) % 115)) * 60 * 1000;
    const replyAt = Math.min(commentAt + replyDelay, now - 60 * 1000);

    rows.push({
      id: commentId,
      parentId: null,
      userId: pick(commenters, hash32(`${commentId}:user`)).id,
      content: COMMENT_TEXTS[(textOffset + i * 7) % COMMENT_TEXTS.length],
      createdAt: new Date(commentAt).toISOString(),
    });
    rows.push({
      id: replyId,
      parentId: commentId,
      userId: ad.user_id,
      content: pick(REPLIES[lang], hash32(`${replyId}:reply`)),
      createdAt: new Date(Math.max(replyAt, commentAt + 60 * 1000)).toISOString(),
    });
  }
  return { rows, count, lang };
}

async function loadData() {
  const ads = await db.all(
    `SELECT a.id, a.user_id, a.city, a.created_at
     FROM annonces a
     WHERE a.id LIKE 'seed-%' AND a.status = 'approved'
     ORDER BY a.created_at ASC, a.id ASC`
  );
  const commenters = await db.all(
    "SELECT id FROM users WHERE id LIKE 'seed-%' AND banned = false ORDER BY id"
  );
  const existing = await db.get(
    "SELECT COUNT(*) AS n FROM comments WHERE id LIKE 'seedc-%' OR id LIKE 'seedr-%'"
  );
  return { ads, commenters, existing: Number(existing?.n || 0) };
}

async function cleanup() {
  await db.init();
  const replies = await db.run("DELETE FROM comments WHERE id LIKE 'seedr-%'");
  const comments = await db.run("DELETE FROM comments WHERE id LIKE 'seedc-%'");
  console.log(`Suppression terminée : ${comments.changes} commentaires, ${replies.changes} réponses.`);
  await db.close();
}

async function seed({ ads, commenters }) {
  await db.init();
  const now = Date.now();
  let created = 0;
  let updated = 0;

  for (const ad of ads) {
    const { rows } = buildThread(ad, commenters, now);
    const values = rows.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const params = rows.flatMap((row) => [row.id, ad.id, row.userId, row.content, row.createdAt, row.parentId]);
    const result = await db.run(
      `INSERT INTO comments (id, annonce_id, user_id, content, created_at, parent_id)
       VALUES ${values}
       ON CONFLICT (id) DO NOTHING`,
      params
    );
    created += result.changes;
    updated += rows.length - result.changes;
  }

  console.log(
    `Terminé : ${created} commentaires/réponses créés, ${updated} déjà présents, ${ads.length} annonces traitées.`
  );
  await db.close();
}

(async () => {
  if (!config.databaseUrl) throw new Error('DATABASE_URL absent : le seed de production est annulé.');

  if (CLEANUP) {
    if (!EXECUTE) {
      console.log('Mode simulation : ajoute --execute pour supprimer les commentaires seed.');
      return;
    }
    await cleanup();
    return;
  }

  await db.init();
  const data = await loadData();

  if (!data.ads.length) throw new Error('Aucune annonce seed approuvée trouvée.');
  if (data.commenters.length < 2) throw new Error('Pas assez de comptes seed pour commenter.');
  await db.close();

  const totalThreads = data.ads.reduce((sum, ad) => sum + commentCount(ad.id), 0);
  console.log('Plan de commentaires :');
  console.log(
    JSON.stringify(
      {
        annonces: data.ads.length,
        commentaires: totalThreads,
        reponses: totalThreads,
        lignesTotal: totalThreads * 2,
        dejaEnBase: data.existing,
        commentateurs: data.commenters.length,
      },
      null,
      2
    )
  );
  for (const ad of data.ads.slice(0, 3)) {
    const thread = buildThread(ad, data.commenters, Date.now());
    console.log(`- ${ad.id} (${ad.city}, ${thread.lang}) : ${thread.count} commentaires + réponses`);
    console.log(`  « ${thread.rows[0].content} » → « ${thread.rows[1].content} »`);
  }

  if (!EXECUTE) {
    console.log('Mode simulation : aucune écriture. Ajoute --execute pour créer les commentaires.');
    return;
  }
  await seed(data);
})().catch((err) => {
  console.error(`Erreur : ${err.message}`);
  process.exitCode = 1;
});
