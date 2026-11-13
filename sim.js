// Balance-Simulation (Node): node sim.js [Läufe=2000]
// Spielt Kämpfe mit der echten Spiellogik (logic.js) automatisch durch und vergleicht zwei Strategien:
//  "nur Angriff" = jeder Held greift immer den ersten lebenden Gegner an
//  "klug"        = Fähigkeiten, Fokus auf schwächsten Gegner, Heilung/Entgiftung, Verteidigen bei Schwerem Schlag, Rundumschlag ab 3 Gegnern
import fs from 'node:fs';
import * as L from './logic.js';

const data = JSON.parse(fs.readFileSync(new URL('./game.json', import.meta.url), 'utf8'));
const RUNS = +process.argv[2] || 2000;
const ENC = { en2: '2 Sumpfwölfe', en3: 'Wolf + 2 Moorkultisten', en1: 'Moorschrat' };

function liveEnemies(c) { return c.enemies.map((e, i) => ({ e, i })).filter((x) => x.e.hp > 0); }
function weakest(c) { return liveEnemies(c).reduce((b, x) => (x.e.hp < b.e.hp ? x : b)).i; }

function decideSimple(s) { return { type: 'attack', target: liveEnemies(s.combat)[0].i }; }

function decideSmart(s, data) {
  const c = s.combat, a = L.currentActor(s), h = s.heroes[a.idx];
  const cls = data.classes[h.cls], ab = cls.ability;
  // Heilung / Entgiftung
  const needy = s.heroes.map((x, i) => ({ x, i })).filter((q) => q.x.hp > 0).sort((p, q) => p.x.hp / p.x.maxHp - q.x.hp / q.x.maxHp);
  if (ab && ab.kind === 'heal' && h.mp >= ab.cost) {
    const t = needy.find((q) => q.x.hp / q.x.maxHp <= 0.6 || (ab.cleanse && L.statusOf(s, 'h', q.i)[ab.cleanse]));
    if (t && (t.x.hp < t.x.maxHp || (ab.cleanse && L.statusOf(s, 'h', t.i)[ab.cleanse]))) return { type: 'ability', target: t.i };
  }
  if ((s.inv.potion || 0) > 0 && needy[0] && needy[0].x.hp / needy[0].x.maxHp <= 0.3 && needy[0].x.hp < needy[0].x.maxHp) return { type: 'item', item: 'potion', hero: needy[0].i };
  if (c.enemies.some((e) => e.hp > 0 && e.intent === 'heavy') && h.row === 'front') return { type: 'defend' };
  if (ab && ab.kind === 'damage' && h.mp >= ab.cost) return { type: 'ability', target: weakest(c) };
  if (liveEnemies(c).length >= 3) return { type: 'sweep' };
  return { type: 'attack', target: weakest(c) };
}

// Spielt einen Kampf zu Ende. Rückgabe: { won, rounds, ko, hpLost }
function fight(s, objId, strat) {
  const obj = s.objs.find((o) => o.id === objId);
  const before = s.heroes.reduce((n, h) => n + h.hp, 0);
  L.startCombat(s, data, obj);
  let ko = 0, guard = 0, rounds = 0, taken = 0;
  while (s.combat && !s.combat.over && guard++ < 400) {
    const a = L.currentActor(s);
    if (!a) break;
    rounds = s.combat.round;
    const hpSum = () => s.heroes.reduce((n, h) => n + h.hp, 0);
    const pre = hpSum();
    if (L.statusOf(s, a.side, a.idx).stun) { const r = L.skipStunned(s, data); count(r); if (r.over) break; continue; }
    const r = a.side === 'h'
      ? L.heroAction(s, data, strat === 'simple' ? decideSimple(s) : decideSmart(s, data))
      : L.enemyStep(s, data, {});
    if (r.error) { if (a.side === 'h') { const r2 = L.heroAction(s, data, { type: 'attack' }); count(r2); if (r2.over) { s.combat = s.combat; break; } } else break; continue; }
    count(r);
    if (a.side === 'e') taken += Math.max(0, pre - hpSum());
    if (r.over) break;
  }
  function count(r) { ((r && r.msgs) || []).forEach((m) => { if (/bewusstlos/.test(m)) ko++; }); }
  const won = s.objs.find((o) => o.id === objId).dead === true;
  return { won, ko, hpLost: taken, rounds };
}

function stats(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
const pct = (x) => (100 * x).toFixed(0) + ' %';
const f1 = (x) => x.toFixed(1);

const lines = [];
const out = (t = '') => { lines.push(t); console.log(t); };

out(`Balance-Simulation, ${RUNS} Läufe je Zeile, Spiellogik aus logic.js, Startgruppe = Schnellgruppe (Stufe 1)`);
out('');
out('## A) Einzelkampf, frische Gruppe (volle LP/Mana, Startvorrat Heiltränke)');
out('| Kampf | Strategie | Sieg | Runden | KO-Helden | Schaden durch Gegner (Gruppe) |');
out('|---|---|---|---|---|---|');
for (const id of Object.keys(ENC)) {
  for (const strat of ['simple', 'smart']) {
    const res = [];
    for (let i = 0; i < RUNS; i++) { const s = L.newGame(data, 1000 + i); res.push(fight(s, id, strat)); }
    out(`| ${ENC[id]} | ${strat === 'simple' ? 'nur Angriff' : 'klug'} | ${pct(stats(res.map((r) => +r.won)))} | ${f1(stats(res.map((r) => r.rounds)))} | ${f1(stats(res.map((r) => r.ko)))} | ${f1(stats(res.map((r) => r.hpLost)))} |`);
  }
}

out('');
out('## B) Kampagnenfolge Wölfe → Kultisten-Gang → Moorschrat');
out('Ohne Rast: LP bleiben, besiegte Helden stehen mit 1 LP auf (aktuelle Übergangsregel). „Immer voll“: volle LP/Mana zwischen den Kämpfen. „Mit Proviant“: echte Rast (restParty) nach jedem Sieg, Startvorrat 3.');
out('| Strategie | Rast | Wölfe gewonnen | + Gang gewonnen | + Schrat gewonnen | KO-Helden gesamt |');
out('|---|---|---|---|---|---|');
for (const strat of ['simple', 'smart']) for (const rest of [false, 'ration', true]) {
  let w1 = 0, w2 = 0, w3 = 0; const kos = [];
  for (let i = 0; i < RUNS; i++) {
    const s = L.newGame(data, 5000 + i); let ko = 0;
    const order = ['en2', 'en3', 'en1'];
    let stage = 0;
    for (const id of order) {
      const r = fight(s, id, strat); ko += r.ko;
      if (!r.won) break;
      stage++;
      if (rest === true) s.heroes.forEach((h) => { h.hp = h.maxHp; h.mp = h.maxMp; });
      else if (rest === 'ration') { s.objs.forEach((o) => { if (o.type === 'enemy' && !o.dead) { o.x = 99; o.y = 99; } }); L.restParty(s, data); }
    }
    if (stage >= 1) w1++; if (stage >= 2) w2++; if (stage >= 3) w3++; kos.push(ko);
  }
  out(`| ${strat === 'simple' ? 'nur Angriff' : 'klug'} | ${rest === true ? 'immer voll' : rest === 'ration' ? 'mit Proviant (3)' : 'nein'} | ${pct(w1 / RUNS)} | ${pct(w2 / RUNS)} | ${pct(w3 / RUNS)} | ${f1(stats(kos))} |`);
}
out('');
out('Hinweis: Die Simulation nutzt die echten Regeln, aber nur zwei feste Strategien. Ein echter Spieler liegt dazwischen.');
if (process.argv.includes('--write')) fs.writeFileSync(new URL('./SIM.md', import.meta.url), '# Balance-Simulation\n\n' + lines.join('\n') + '\n');
