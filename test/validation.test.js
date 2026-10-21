const test = require('node:test');
const assert = require('node:assert/strict');
const validation = require('../server/lib/validation');

test('safeRelativeUrl refuse les redirections externes', () => {
  assert.equal(validation.safeRelativeUrl('https://evil.example/phish'), 'index.html');
  assert.equal(validation.safeRelativeUrl('//evil.example/phish'), 'index.html');
  assert.equal(validation.safeRelativeUrl('javascript:alert(1)'), 'index.html');
  assert.equal(validation.safeRelativeUrl('/\\evil.example'), 'index.html');
  assert.equal(validation.safeRelativeUrl('publier.html?x=1'), 'publier.html?x=1');
  assert.equal(validation.safeRelativeUrl('/product.html?id=a1'), 'product.html?id=a1');
});

test('checkoutRedirect limite les pages autorisées', () => {
  assert.equal(validation.checkoutRedirect('https://evil.example'), 'publier.html');
  assert.equal(validation.checkoutRedirect('admin.html'), 'publier.html');
  assert.equal(validation.checkoutRedirect('premium.html'), 'premium.html');
  assert.equal(validation.checkoutRedirect('product.html?id=a1'), 'product.html?id=a1');
  assert.equal(validation.checkoutRedirect(''), 'publier.html');
});

test('validation des champs utilisateur', () => {
  assert.equal(validation.email('TEST@Example.COM'), 'test@example.com');
  assert.equal(validation.email('pas-un-email'), null);
  assert.equal(validation.password('court'), null);
  assert.equal(validation.password('motdepasse'), 'motdepasse');
  assert.equal(validation.age(17), null);
  assert.equal(validation.age('28'), 28);
  assert.ok(validation.pseudo('Nom_Valide-1'));
  assert.equal(validation.pseudo('<script>alert(1)</script>'), null);
  assert.equal(validation.title('abc'), null);
  assert.ok(validation.title('Un titre valide'));
  assert.equal(validation.description('trop court'), null);
  assert.equal(validation.city('A'), null);
  assert.equal(validation.commentContent('a'), null);
  assert.equal(validation.oneOf('sortie', validation.CATEGORIES), 'Sortie');
  assert.equal(validation.oneOf('inexistant', validation.CATEGORIES), null);
});
