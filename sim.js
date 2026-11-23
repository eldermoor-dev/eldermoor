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
function weakest(c) { // 0.21.0: lebt eine Wache (guard), wird sie zuerst bekämpft (sie deckt die anderen)
  const live = liveEnemies(c), g = live.filter((x) => data.enemies[x.e.kind].guard);
  return (g.length && live.length > 1 ? g : live).reduce((b, x) => (x.e.hp < b.e.hp ? x : b)).i;
}
// 0.21.0: Talente in der Kampagne – nach jedem Kampf lernt jeder Held, was geht (Zweige der Reihe nach, erster Zweig zuerst)
function autoTalents(s) {
  s.heroes.forEach((h, i) => { for (let k = 0; k < 20; k++) { const n = L.talentNodes(data, h.cls).find((x) => L.canLearnTalent(data, h, x.id).ok); if (!n) break; L.learnTalent(s, data, i, n.id); } });
}

function decideSimple(s) { return { type: 'attack', target: liveEnemies(s.combat)[0].i }; }

function decideSmart(s, data) {
  const c = s.combat, a = L.currentActor(s), h = s.heroes[a.idx];
  const cls = data.classes[h.cls], ab = cls.ability;
  // Heilung / Entgiftung
  const needy = s.heroes.map((x, i) => ({ x, i })).filter((q) => q.x.hp > 0).sort((p, q) => p.x.hp / p.x.maxHp - q.x.hp / q.x.maxHp);
  if (ab && ab.kind === 'heal' && h.mp >= ab.cost) {
    const t = needy.find((q) => q.x.hp / q.x.maxHp <= 0.6 || L.canCleanse(ab, L.statusOf(s, 'h', q.i)));
    if (t && (t.x.hp < t.x.maxHp || L.canCleanse(ab, L.statusOf(s, 'h', t.i)))) return { type: 'ability', target: t.i };
  }
  if ((s.inv.potion || 0) > 0 && h.hp / h.maxHp <= 0.35) return { type: 'item', item: 'potion', hero: a.idx }; // seit 0.15.10 trinkt nur der Held am Zug selbst
  // angesagter Gegnerzauber (Boss): wer angeschlagen ist, verteidigt
  const castSoon = c.enemies.some((e) => e.hp > 0 && (L.enemyOf(data, e).cast || []).some((sp) => sp.announce && ((e.ct || 0) + 1) % sp.every === 0));
  if (castSoon && h.hp / h.maxHp <= 0.6 && !(ab && ab.kind === 'heal')) return { type: 'defend' };
  if ((s.inv.oelflasche || 0) > 0 && !(ab && ab.kind !== 'heal' && h.mp >= ab.cost) && c.enemies.some((e) => e.hp > 0 && data.enemies[e.kind].boss)) return { type: 'item', item: 'oelflasche', target: weakest(c) };
  if (c.enemies.some((e) => e.hp > 0 && e.intent === 'heavy') && h.row === 'front') return { type: 'defend' };
  // Zauber: bester bezahlbarer Schadenszauber (Elementschwäche und Flächenwirkung zählen), Lichtwelle bei mehreren Verletzten
  const spells = L.knownSpells(data, h);
  const hurt = s.heroes.filter((x) => x.hp > 0 && x.hp / x.maxHp <= 0.6).length;
  const gh = spells.find((q) => q.kind === 'heal' && q.all && h.mp >= q.cost);
  if (gh && hurt >= 2) return { type: 'spell', spell: gh.id };
  let best = null, bv = 0;
  for (const sp of spells) {
    if (sp.kind !== 'damage' || h.mp < sp.cost) continue;
    const targets = sp.all ? liveEnemies(c) : [liveEnemies(c).find((x) => x.i === weakest(c))];
    const v = targets.reduce((n, x) => n + (sp.mult || 100) * (100 + (sp.element ? ((data.enemies[x.e.kind].resist || {})[sp.element] || 0) : 0)) / 100, 0) / sp.cost ** 0.5;
    if (v > bv) { bv = v; best = sp; }
  }
  if (best) return best === spells[0] ? { type: 'ability', target: weakest(c) } : { type: 'spell', spell: best.id, target: weakest(c) };
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

// ---------- Kampagne (0.16.7): alle Gebiete in Spielreihenfolge, natürliche Erfahrung, Beute, Ausrüstung, Rast, Einkauf ----------
// Annahmen (kein Spieltest!): die Gruppe besiegt alle Gegner eines Gebiets in fester Reihenfolge (Boss zuletzt), öffnet jede Truhe,
// sobald ihre Wächter besiegt sind, legt bessere Ausrüstung sofort an, rastet nach einem Kampf, wenn jemand unter 60 % LP ist oder
// die Zauberer unter halbem Mana sind (mit Proviant, sonst hungrig; der Rückweg zu einem sicheren Rastplatz wird nicht simuliert),
// und kauft vor jedem Gebiet bei Hedda nach (bis 4 Heiltränke, 3 Proviant, solange das Gold reicht). Niederlage: Regel des Spiels
// (halbe LP, 25 % Gold weg), Rast, neuer Versuch; nach 3 Niederlagen am selben Gegner gilt der Lauf als gescheitert.
const CAMPAIGN = ['test1', 'test2', 'moorpfad', 'kultgruft', 'schratgruben', 'nebelturm', 'festung1', 'festung2', 'festung3', 'festung4', 'festung5']; // 0.33.0: Spinnenhöhle; 0.27.0: Keller 1 und Blutgruft dazu
function simRest(s) {
  const need = s.heroes.some((h) => h.hp / h.maxHp < 0.6) || s.heroes.some((h) => data.classes[h.cls].res.name === 'Mana' && h.mp < h.maxMp / 2);
  if (!need) return;
  const hide = s.objs.filter((o) => o.type === 'enemy' && !o.dead).map((o) => [o, o.x, o.y]);
  hide.forEach(([o]) => { o.x = -9; o.y = -9; });
  L.restParty(s, data);
  hide.forEach(([o, x, y]) => { o.x = x; o.y = y; });
}
function simEquip(s) {
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < s.heroes.length; i++) for (const id of Object.keys(s.inv)) {
    if (!(s.inv[id] > 0)) continue;
    const it = L.itemDef(s, data, id);
    if (!it || it.kind !== 'equip' || !L.canEquip(data, s.heroes[i], id, s)) continue;
    const cur = s.heroes[i].equip && s.heroes[i].equip[it.slot] ? L.itemDef(s, data, s.heroes[i].equip[it.slot]) : null;
    const val = (x) => (x ? (x.atk || 0) * 2 + (x.def || 0) * 2 + (x.init || 0) + (x.affixes || []).reduce((n, a) => n + (a.val || 0), 0) : -1);
    if (val(it) > val(cur)) L.equipItem(s, data, id, i);
  }
}
function simChests(s) {
  const lvl = L.getLevel(data, s);
  for (const o of s.objs) {
    if (o.type !== 'chest' || o.open || L.chestGuarded(s, data, o)) continue;
    for (let d = 0; d < 4; d++) {
      const x = o.x - L.DIRS[d].dx, y = o.y - L.DIRS[d].dy;
      if (L.isWallChar(L.cellChar(lvl, x, y)) || L.blockerAt(s, x, y)) continue;
      s.player = { x, y, dir: d }; L.interact(s, data); break;
    }
  }
  simEquip(s);
}
function simShop(s) {
  const buy = (id, upTo) => { while ((s.inv[id] || 0) < upTo && s.gold >= L.buyPrice(s, data, id)) { if (L.buyItem(s, data, 'moorrand', id).error) break; } };
  buy('potion', 4); buy('ration', 3);
}
function campaign(seed, strat) {
  const s = L.newGame(data, seed), log = {};
  let failed = null;
  for (const lid of CAMPAIGN) {
    if (failed) break;
    simShop(s);
    L.jumpToLevel(s, data, lid);
    simChests(s);
    const foes = s.objs.filter((o) => o.type === 'enemy').sort((a, b) => (data.enemies[a.kind].boss ? 1 : 0) - (data.enemies[b.kind].boss ? 1 : 0));
    for (const f of foes) {
      const rec = { level: stats(s.heroes.map((h) => h.level)), first: false, tries: 0, ko: 0, lost: 0, boss: !!data.enemies[f.kind].boss, area: lid, name: data.enemies[f.kind].name };
      const full = s.heroes.reduce((n, h) => n + h.maxHp, 0);
      let won = false;
      while (!won && rec.tries < 3) {
        rec.tries++;
        const r = fight(s, f.id, strat);
        autoTalents(s); // 0.21.1: beide Strategien lernen Talente (jeder Spieler verteilt Punkte)
        if (rec.tries === 1) { rec.first = r.won; rec.ko = r.ko; rec.lost = r.hpLost / full; rec.rounds = r.rounds; }
        won = r.won;
        if (!won) L.applyDefeat(s, data);
        simRest(s);
      }
      rec.won = won;
      log[f.id] = rec;
      if (!won) { failed = f.id; break; }
      simChests(s);
    }
  }
  return { log, failed, level: stats(s.heroes.map((h) => h.level)) };
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
out('## C) Ganze Kampagne (Testgewölbe → Blutgruft), natürliche Stufen, Beute, Rast, Einkauf');
out('Annahmen stehen in sim.js über `campaign`. „1. Versuch“ = Sieg ohne vorherige Niederlage gegen diesen Gegner. Schaden = Anteil der Max-LP der Gruppe, den die Gegner im 1. Versuch abziehen.');
const CR = Math.max(100, Math.round(RUNS / 5));
const camp = {};
for (const strat of ['simple', 'smart']) { camp[strat] = []; for (let i = 0; i < CR; i++) camp[strat].push(campaign(9000 + i, strat)); }
out(`${CR} Läufe je Strategie.`);
out('');
out('| Strategie | Kampagne geschafft | Ø Stufe am Ende | Niederlagen je Lauf |');
out('|---|---|---|---|');
for (const strat of ['simple', 'smart']) {
  const c = camp[strat];
  out(`| ${strat === 'simple' ? 'nur Angriff' : 'klug'} | ${pct(stats(c.map((r) => +!r.failed)))} | ${f1(stats(c.map((r) => r.level)))} | ${f1(stats(c.map((r) => Object.values(r.log).reduce((n, x) => n + x.tries - (x.won ? 1 : 0), 0))))} |`);
}
out('');
out('| Gebiet | Gegner | Strategie | erreicht | Ø Stufe | Sieg 1. Versuch | Runden | KO-Helden | Schaden |');
out('|---|---|---|---|---|---|---|---|---|');
const order = [];
for (const lid of CAMPAIGN) for (const o of data.levels[lid].objects) if (o.type === 'enemy') order.push([lid, o]);
order.sort((a, b) => CAMPAIGN.indexOf(a[0]) - CAMPAIGN.indexOf(b[0]) || (data.enemies[a[1].kind].boss ? 1 : 0) - (data.enemies[b[1].kind].boss ? 1 : 0));
for (const [lid, o] of order) for (const strat of ['simple', 'smart']) {
  const recs = camp[strat].map((r) => r.log[o.id]).filter(Boolean);
  if (!recs.length) { out(`| ${data.levels[lid].name} | ${o.id} | ${strat === 'simple' ? 'nur Angriff' : 'klug'} | 0 % | – | – | – | – | – |`); continue; }
  const label = (o.kinds || [o.kind]).map((k) => data.enemies[k].name).join(' + ') + (data.enemies[o.kind].boss ? ' (Boss)' : '');
  out(`| ${data.levels[lid].name} | ${label} | ${strat === 'simple' ? 'nur Angriff' : 'klug'} | ${pct(recs.length / CR)} | ${f1(stats(recs.map((r) => r.level)))} | ${pct(stats(recs.map((r) => +r.first)))} | ${f1(stats(recs.map((r) => r.rounds)))} | ${f1(stats(recs.map((r) => r.ko)))} | ${pct(stats(recs.map((r) => r.lost)))} |`);
}
out('');
out('Hinweis: Die Simulation nutzt die echten Regeln, aber nur zwei feste Strategien. Ein echter Spieler liegt dazwischen.');
if (process.argv.includes('--write')) fs.writeFileSync(new URL('./SIM.md', import.meta.url), '# Balance-Simulation\n\n' + lines.join('\n') + '\n');
