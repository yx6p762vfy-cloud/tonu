const config = require('../config');

function apiUrl(pathname) {
  return `${config.supabaseUrl}/storage/v1${pathname}`;
}

function objectUrl(fileName) {
  return `${config.supabaseUrl}/storage/v1/object/${config.storageBucket}/${fileName}`;
}

function headers(extra = {}) {
  return {
    Authorization: `Bearer ${config.supabaseServiceKey}`,
    ...extra,
  };
}

function publicUrl(fileName) {
  return `${config.supabaseUrl}/storage/v1/object/public/${config.storageBucket}/${fileName}`;
}

async function ensureBucket() {
  if (!config.storageConfigured()) return;
  const res = await fetch(apiUrl(`/bucket/${config.storageBucket}`), { headers: headers() });
  if (res.ok) return;
  if (res.status !== 404 && res.status !== 400) {
    throw new Error(`Bucket « ${config.storageBucket} » inaccessible (${res.status})`);
  }
  const created = await fetch(apiUrl('/bucket'), {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name: config.storageBucket, public: true }),
  });
  if (!created.ok && created.status !== 409) {
    throw new Error(`Création du bucket « ${config.storageBucket} » impossible : ${await created.text()}`);
  }
}

async function putObject(fileName, buffer, contentType = 'image/jpeg') {
  const res = await fetch(objectUrl(fileName), {
    method: 'POST',
    headers: headers({
      'Content-Type': contentType,
      'x-upsert': 'true',
      'x-cache-control': '31536000',
    }),
    body: new Uint8Array(buffer),
  });
  if (!res.ok) {
    throw new Error(`Stockage de la photo impossible (${res.status})`);
  }
}

async function deleteObjects(fileNames) {
  if (!config.storageConfigured()) return;
  for (const name of fileNames) {
    if (!name || String(name).startsWith('images/')) continue;
    await fetch(objectUrl(name), { method: 'DELETE', headers: headers() }).catch(() => {});
  }
}

module.exports = { ensureBucket, putObject, deleteObjects, publicUrl };
