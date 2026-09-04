/*
 * js/road-events.js — 街道の出来事 (#45 Phase 1) の唯一の正
 * ════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-09-03_road-events.md` §5-1 / §5-2。検証は
 * tools/verify_road_events.js。
 *
 * ★ このファイルの責務は 2 つだけ。
 *     ① **イベント表** (6 件の日本語 + 地形 + checkKey + DC + 発生率) の唯一の正
 *     ② **器の描画** (#worldEventBox の中身を組み立てて開閉する)
 *   ⛔ **発火しない。** 「どの停留所で / どの確率で / 何度まで出すか」は world.html の
 *     onArriveStep 側 (項目 3) の担当。ここは呼ばれたら描くだけ。
 *
 * ■ 規律 (⛔ 破ると受入条件が赤くなる)
 *   ⛔ **文言を world.html へ 1 文字も写さない** —— (0b) が world.html の配信バイトを
 *      全文検索して、下の title / intro / label / 結末文が 1 つでも出てきたら赤にする
 *      (#15 B-1 と同じ規律。変異 `copytext` が番人)。
 *   ⛔ **座標を持たない。** 地形は WORLD_MAP.STEPS[id].on の両端から引く
 *      (⛔ 17 件の座標表を作らない)。停留所の実体は js/world-map.js が唯一の正。
 *   ⛔ **localStorage へ書かない。** (#45 / #47 とも 0 件を維持。(1d) が配信バイトの数で見る)
 *   ⭐ **#47 で world.html の sessionStorage.setItem を 1 件だけ増やした** (`roadBoon`)。
 *      ⛔ **removeItem は増やさない** —— 消費は index.html の担当で、world 側は書くだけ
 *      (verify_road_events (2c) が removeItem === 1 / localStorage 0 件を数で縛っている)。
 *   ⛔ **このファイル自身は storage へ 1 バイトも書かない。** road-events.js が持つのは
 *      **表 (BOONS) と引き (boonOf) だけ**で、書く決定は world.html の finishRoadEvent (#47 §2-5)。
 *   ⚠⚠⚠ **使える checkKey は 12 個だけ** (js/skill-check.js の CHECKS)。
 *      survival / medicine / nature は **存在しない** —— 書くと resolveSkillCheck が
 *      console.warn して Promise.resolve(null) を返し、**判定ごと静かに消える**。
 *      下の 6 件は persuasion / insight / perception / athletics / investigation /
 *      religion の 6 種で、全部 CHECKS 内にある。
 *   ⛔ **Product Identity 配慮**: WotC 固有 IP (Beholder / Mind Flayer / Displacer Beast 等)
 *      を 1 つも使わない。6 件とも一般的な街道の情景。
 *
 * ■ 公開 API (window.ROAD_EVENTS)
 *   データ … EVENTS / TERRAINS / RATE / WAY_TERRAIN / SITE_TERRAIN / TERRAIN_RANK
 *   実り   … BOONS (#47 の恩恵表) / boonOf(ev, choice, outcome)
 *   引き   … terrainOf(id) / stops() / rateOf(terrain) / eventsFor(terrain) / byId(id)
 *   器     … open(ev, onChoice) / showResult(ev, text, onDone, boon) / close() / isOpen() /
 *            current() / el()
 */
(function (global) {
  "use strict";

  /* ══ 地形 ═══════════════════════════════════════════════════════════════
     中継点 (kind:"way") の地形。⛔ 刻み点は書かない —— 両端から引く。 */
  var WAY_TERRAIN = {
    pier: "coast", cross_n: "coast", farm_n: "woods",
    lake_n: "lake", lakeside: "lake", pass_n: "mountain", village_s: "swamp"
  };
  /* 拠点 (kind:"site") の地形。⚠ **刻み点の両端を引くためだけ**に要る。
     site そのものでは発火しない (入場ダイアログが優先。(1b) が縛る)。 */
  var SITE_TERRAIN = {
    phlan: "coast", forest: "woods", swamp: "swamp", fort: "swamp",
    mine: "mountain", temple: "mountain", dragon: "mountain"
  };

  /* ⭐⭐⭐ 刻み点は両端の地形が食い違うことがある (例 lakeside=lake ↔ mine=mountain)。
     そのときは **より辺境な側が勝つ** ——「街道は険しいほうの土地の顔をしている」。
     ⚠ この順序は依頼書 §2-5 の地形割り (coast 2 / woods 2 / lake 5 / mountain 4 /
       swamp 4 = 17) を **そのまま再現する**ために決まっている。並べ替えると件数が動く。
       farm_n(woods)  + pass_n(mountain)   → mountain
       cross_n(coast) + swamp(swamp)       → swamp
       fort(swamp)    + lakeside(lake)     → lake
       lakeside(lake) + mine/dragon(mtn)   → mountain
     低 → 高 の順。 */
  var TERRAIN_RANK = ["coast", "woods", "swamp", "lake", "mountain"];

  /* 地形ごとの発生率。⭐ 遊んで動かすレバー (依頼書 §8「測らないこと」)。
     ⛔ 受入条件は具体値を縛らない —— 縛るのは (3b) の「地形ごとに違う」という向きだけ。
     ⚠ 使うのは項目 3 の maybeRoadEvent。ここは表を持つだけで振らない。 */
  var RATE = { coast: 0.05, woods: 0.10, lake: 0.12, mountain: 0.18, swamp: 0.20 };

  /* ══ イベント表 (6 件) ═══════════════════════════════════════════════════
     1 件 = 導入文 + 選択肢 2 つ。⭐ **必ず片方は判定なし (立ち去る)**。
     ⭐ 判定つきの選択肢は success と fail を **必ず別の文**にする
        (⛔ 同文だと d20 を振る意味が無い。変異 `sameresult` が番人)。
     choices[].check … true = ev.checkKey / ev.dc で判定する / false = 判定なし
     ⚠ dc は js/skill-check.js の DC_TIERS のキー (veryEasy 5 / easy 10 / medium 15 /
       hard 20 / veryHard 25)。⛔ 数値を直書きしない。 */
  var EVENTS = [
    {
      id: "coast_dock_quarrel", terrain: "coast", checkKey: "persuasion", dc: "easy",
      title: "桟橋のいざこざ",
      intro: "潮の匂いに混じって怒鳴り声が飛んでくる。荷を降ろしかけた船乗りと、"
        + "帳面を抱えた仲買人が桟橋の真ん中で睨み合い、樽と縄が道をふさいでいた。"
        + "どちらも一歩も引く気がない。",
      choices: [
        {
          label: "間に割って入り、話をまとめる", check: true,
          success: "双方の言い分を順に聞き、樽を数え直させると、食い違いは帳面の写し間違いだった。"
            + "仲買人が詫びを入れ、船乗りたちは笑って荷を脇へ寄せる。"
            + "礼にと干し魚をひと束握らされ、道が開けた。",
          fail: "割って入った途端、二人の怒りがそろってこちらへ向いた。"
            + "よそ者は引っ込んでいろ、と樽の陰へ押し戻される。"
            + "結局、荷が片付くまで日陰でしばらく待たされた。"
        },
        {
          label: "関わらず、荷の脇をすり抜ける", check: false,
          result: "樽と縄の隙間を縫って桟橋を渡る。背中で怒鳴り声が続いていたが、"
            + "振り返るころには誰かが仲裁に入っていた。"
        }
      ]
    },
    {
      id: "woods_woodcutter", terrain: "woods", checkKey: "insight", dc: "easy",
      title: "樵の道案内",
      intro: "切り株に腰かけた樵が斧を膝に置き、こちらへ手を振った。"
        + "「その先の街道は倒木でふさがっとる。沢沿いに回れば半日は縮むぞ」。"
        + "親切そうな笑みだが、斧の刃は真新しく、足元に木屑がひとつも落ちていない。",
      choices: [
        {
          label: "男の言葉の裏を読む", check: true,
          success: "世間話を装って沢の様子を尋ねると、答えがことごとく曖昧になる。"
            + "倒木の話は作り話で、近道の先には仲間が待っているらしい。"
            + "踵を返すと、樵は舌打ちして森の奥へ消えた。",
          fail: "何度うなずいても、男の話に綻びは見えなかった。"
            + "教えられた沢沿いをしばらく進んでから、そこが行き止まりの窪地だと気づく。"
            + "街道へ戻るのに、かえって時間を食った。"
        },
        {
          label: "礼だけ言って街道を進む", check: false,
          result: "忠告に礼を言い、そのまま街道をたどる。倒木などどこにも無かった。"
            + "振り返ると、切り株の男はもう居ない。"
        }
      ]
    },
    {
      id: "lake_ripple", terrain: "lake", checkKey: "perception", dc: "medium",
      title: "湖面のさざなみ",
      intro: "風は凪いでいるのに、岸から少し離れた水面だけが円を描いて揺れている。"
        + "葦のあいだには、途中で断ち切られた舫い綱が浮かんでいた。",
      choices: [
        {
          label: "水際に寄って、揺れの正体を見きわめる", check: true,
          success: "波紋の中心に、沈みかけた小舟の舳先が見えた。"
            + "船底には油紙にくるまれた荷が引っかかっている。"
            + "長い枝で手繰り寄せると、湖水を吸っていない乾いた包みがひとつ。"
            + "持ち主の名はどこにも書かれていなかった。",
          fail: "覗き込んだ拍子に足元の泥が崩れ、膝まで水に浸かった。"
            + "揺れはいつのまにか収まり、あとには濁った水と、冷えた足だけが残る。"
        },
        {
          label: "岸から離れて先を急ぐ", check: false,
          result: "揺れから目を離し、街道の乾いた側を歩く。"
            + "しばらくして、背後で何かが水に沈む重い音がした。振り返らなかった。"
        }
      ]
    },
    {
      id: "mountain_rockfall", terrain: "mountain", checkKey: "athletics", dc: "medium",
      title: "山道の落石",
      intro: "谷を渡る風に土埃が混じる。見上げれば斜面の途中が新しく崩れ、"
        + "人の背丈ほどの岩が街道を半分ふさいでいた。荷車なら通れない。"
        + "人ひとりなら——ぎりぎりか。",
      choices: [
        {
          label: "岩に肩を入れ、街道の端へ押しのける", check: true,
          success: "足場を固め、息を合わせて岩を押す。三度目でようやく重心が傾き、"
            + "岩は谷側へごろりと転がり落ちた。街道は元の幅を取り戻し、"
            + "あとから来る誰かも通れる。",
          fail: "岩は見た目より深く土を噛んでいた。押しても軋むばかりで、"
            + "代わりに上から小石が降ってくる。"
            + "諦めて隙間を這い抜けたが、肩と脛に擦り傷が残った。"
        },
        {
          label: "隙間を選んで慎重に抜ける", check: false,
          result: "岩と崖のあいだの狭い隙間へ、荷物を先に通してから体を滑り込ませる。"
            + "誰も落ちずに抜けられた。街道はふさがれたままだ。"
        }
      ]
    },
    {
      id: "swamp_marker", terrain: "swamp", checkKey: "investigation", dc: "medium",
      title: "沼の道しるべ",
      intro: "水草の浮いた泥道に、白く塗られた杭が並んでいる。安全な足場を示す印だ。"
        + "だが手前の一本だけ、打ち込まれた穴がふたつある。"
        + "誰かが抜いて、別の向きに刺し直した跡だった。",
      choices: [
        {
          label: "杭の跡と沼底を調べ、本当の道を割り出す", check: true,
          success: "古い穴の角度と、水面下に沈んだ石畳の連なりが噛み合った。"
            + "杭が指す先は底なしの泥、本来の道はその左手。"
            + "硬い足場だけを踏んで、靴を濡らさずに渡りきる。"
            + "誰が何のために杭を動かしたのかは、わからないままだ。",
          fail: "どちらの穴が古いのか、泥に埋もれて読み取れない。"
            + "勘を頼りに踏み出した二歩目で、腰まで沈んだ。"
            + "引き上げるのに縄と時間を使い、装備は泥まみれになった。"
        },
        {
          label: "杭を信じず、来た跡をたどって迂回する", check: false,
          result: "杭には目もくれず、自分たちの足跡が残る硬い縁を選んで大きく回り込む。"
            + "遠回りだったが、泥に足を取られはしなかった。"
        }
      ]
    },
    {
      id: "swamp_pilgrim", terrain: "swamp", checkKey: "religion", dc: "easy",
      title: "行き倒れの巡礼者",
      intro: "枯れた葦の陰に、旅装のまま横たわった亡骸があった。"
        + "胸の上で組まれた手には、擦り切れた巡礼の護符が握られている。"
        + "もう何日も、誰にも見つけられていない。",
      choices: [
        {
          label: "作法にのっとって手向けをする", check: true,
          success: "護符の紋から巡礼先を読み取り、その神への短い祈りを捧げる。"
            + "石を積んで風よけを作り、名を刻む代わりに護符を上向きに置いた。"
            + "立ち上がると、沼の空気がわずかに軽くなった気がした。",
          fail: "祈りの言葉は途中で怪しくなり、積んだ石はすぐに泥へ傾いた。"
            + "手向けたつもりが形にならず、後ろ髪を引かれたまま歩き出す。"
            + "しばらく、誰かに見られている心地が消えなかった。"
        },
        {
          label: "手を合わせるだけにして立ち去る", check: false,
          result: "何も持ち去らず、ただ黙って手を合わせる。"
            + "巡礼者は葦の陰に横たわったまま、沼の静けさへ戻っていった。"
        }
      ]
    }
  ];

  /* ══ 街道の実り (#47 §2-9) ═══════════════════════════════════════════════
     ⭐ **判定に勝った枝でだけ**手に入る。⛔ check:false の枝 (result) には付けない ——
       既存 golden 3 本 (verify_world_steps:774 / world_map:683 / quest_walk:831) が
       `(ev.choices||[]).filter(x => !x.check)[0]` を機械的に押して index.html まで進むので、
       そこへ恩恵を付けると maxHp が非決定的に動く (#47 §2-2 / 変異 dismissboon が番人)。
     ⚠ label は index.html の updateInfo → appendLog (innerHTML 代入) まで届くので、
       **`/^[^\r\n<>&"']{1,24}$/` を満たす短い日本語だけ**にする (#47 §2-3)。
     ⛔ label を world.html へ 1 文字も写さない ((0b) が配信バイトを全文検索する。変異 copyboon)。
     ⛔ kind は 2 種だけ。増やすときは index.html の consumeRoadBoon も同時に。
     ⭐ 割り当ての理屈 = **物か体力が残るもの = 糧 (provision) / 先を読む目が残るもの = 備え
       (vigilance)**。⛔ 恣意ではない (#47 §2-9 に 6 件ぶんの根拠)。 */
  var BOONS = {
    coast_dock_quarrel: { kind: "provision", label: "干し魚の束" },
    lake_ripple:        { kind: "provision", label: "油紙の包み" },
    mountain_rockfall:  { kind: "provision", label: "開けた街道" },
    woods_woodcutter:   { kind: "vigilance", label: "樵の嘘を見抜いた目" },
    swamp_marker:       { kind: "vigilance", label: "動かされた杭の記憶" },
    swamp_pilgrim:      { kind: "vigilance", label: "手向けを済ませた心" }
  };

  /* 恩恵を引く。⛔ ここが唯一の「もらえる条件」。3 つ全部が真のときだけ返す。 */
  function boonOf(ev, choice, outcome) {
    if (!ev || !choice || !choice.check) return null;      /* 判定なしの枝は対象外 */
    if (!outcome || !outcome.success) return null;         /* 失敗 / null は対象外 */
    var b = has(BOONS, ev.id) ? BOONS[ev.id] : null;
    return b ? { kind: b.kind, label: b.label, event: ev.id } : null;
  }

  /* 地形の一覧。⛔ 5 を直書きしない —— RATE の実体から引く。 */
  var TERRAINS = Object.keys(RATE);

  // ══ 引き (データ) ═══════════════════════════════════════════════════════
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function wm() { return global.WORLD_MAP || null; }
  function rank(t) { return TERRAIN_RANK.indexOf(t); }

  /* ノード (way / site) の地形。⛔ 刻み点はここでは引けない。 */
  function nodeTerrain(id) {
    if (has(WAY_TERRAIN, id)) return WAY_TERRAIN[id];
    if (has(SITE_TERRAIN, id)) return SITE_TERRAIN[id];
    return null;
  }

  /* 停留所 id → 地形。⭐ 刻み点 ("a__b@i") は WORLD_MAP.STEPS[id].on の両端から引く。
     ⛔ 座標も別表も持たない。 */
  function terrainOf(id) {
    var direct = nodeTerrain(id);
    if (direct) return direct;
    var W = wm();
    if (!W || !W.STEPS || !has(W.STEPS, id)) return null;
    var on = W.STEPS[id].on;
    if (!on || on.length < 2) return null;
    var a = nodeTerrain(on[0]), b = nodeTerrain(on[1]);
    if (!a) return b || null;
    if (!b) return a;
    return (rank(a) >= rank(b)) ? a : b;
  }

  /* イベントが起きうる停留所 (母集団)。⭐ **実体から数える** —— way + 刻み点。
     ⛔ site は除外 (入場ダイアログが優先。(1b) が縛る)。
     ⛔ 17 を直書きしない ((0e) / 変異 nodecount が番人)。 */
  function stops() {
    var W = wm();
    if (!W) return [];
    var out = [], k;
    for (k in W.NODES) if (has(W.NODES, k) && W.NODES[k].kind === "way") out.push(k);
    for (k in (W.STEPS || {})) if (has(W.STEPS, k)) out.push(k);
    return out;
  }

  function rateOf(terrain) {
    return (terrain && has(RATE, terrain)) ? RATE[terrain] : 0;
  }
  function eventsFor(terrain) {
    return EVENTS.filter(function (e) { return e.terrain === terrain; });
  }
  function byId(id) {
    for (var i = 0; i < EVENTS.length; i++) if (EVENTS[i].id === id) return EVENTS[i];
    return null;
  }

  // ══ 種つき乱数 (依頼書 §6-2) ═══════════════════════════════════════════════
  /* ⚠⚠⚠ **確率のままだとドライバが間欠で赤くなる。** #41 で NPC の巡回が
       verify_town_map を 38% / 15% / 8% の確率で落とし、原因の特定に丸一日かかった。
     ⭐ 種は **URL の ?roadseed=N** から読む。⛔ __world へ書き込みの窓を作らない
       (「__world は読むためだけ」と #23 / #40 / #43 の 3 枚が明記している)。
     ⚠ 種が無いときは Math.random() 由来の種を **1 回だけ**引く
       = 本番の姿は 1 バイトも変わらない (毎回ちがう出来事が起きる)。
     ⛔ 発火判定で Math.random を **直接**使わない (変異 seedignore が番人)。
     ⛔ ?roadseed は撤退スイッチではない —— 決定論のシームであって機能の on/off ではない。 */
  var SEED_PARAM = "roadseed";
  var seedInfo = null, rndState = 0;
  function ensureRnd() {
    if (seedInfo) return;
    var raw = null;
    try { raw = new URLSearchParams(location.search).get(SEED_PARAM); } catch (e) { raw = null; }
    var n = (raw === null || raw === "") ? NaN : Number(raw);
    seedInfo = isFinite(n) ? { seed: (n >>> 0), fromUrl: true }
                           : { seed: (Math.random() * 4294967296) >>> 0, fromUrl: false };
    rndState = seedInfo.seed;
  }
  /* mulberry32 (1 行 PRNG)。⛔ ここを Math.random へ戻さない。 */
  function rnd() {
    ensureRnd();
    rndState = (rndState + 0x6D2B79F5) >>> 0;
    var t = rndState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function seed() { ensureRnd(); return seedInfo.seed; }
  function seedFromUrl() { ensureRnd(); return seedInfo.fromUrl; }

  /* 地形の発生率で 1 回振る。⭐ 呼び手 (world.html) は確率を 1 つも知らない
     (⛔ 5% / 20% を world.html へ写さない。変異 alwaysfire が番人)。 */
  function roll(terrain) { return rnd() < rateOf(terrain); }
  /* その地形のイベントを 1 件引く。⛔ 「いつも先頭」にしない (swamp は 2 件ある)。 */
  function pickEvent(terrain) {
    var list = eventsFor(terrain);
    if (!list.length) return null;
    return list[Math.floor(rnd() * list.length) % list.length];
  }

  // ══ 街道の襲撃 (#51) ═══════════════════════════════════════════════════════
  /* ⛔ **EVENTS に入れない。** 入れると pickEvent の引きが動き、verify_road_events が
       固定種 (SEED_NEAR) で発火させる 1 件が変わって、(3f) が結末を突き合わせる前に
       ページが index.html へ落ちる (#51 §2-3。変異 intoevents が番人)。
     ⛔ **rndState を 1 ビットも触らない。** あれは単一の可変状態なので、1 回引くだけで
       既存 golden の決定論が全部 1 つずれる (#51 §2-4。変異 sharedrng が番人)。
       ⇒ 下の ambState を持つ **専用ストリーム**から引く。
     ⭐ 選択肢は 2 つ。**判定なしの枝は必ず「見捨てて通り過ぎる」側**にする ——
       既存 golden 3 本 (verify_world_steps:774 / verify_world_map:683 / verify_quest_walk:831) が
       `filter(x => !x.check)[0]` を機械的に押すので、そちらが戦闘だと横断のたびに
       index.html へ落ちる (#51 §2-5。変異 helpnocheck が番人)。
     ⭐ 判定が決めるのは「戦うかどうか」ではなく「**どう戦うか**」
       (成功 = 奇襲 / 失敗 = 正面からの乱戦)。⛔ 失敗で戦闘が消える設計にしない。
     ⚠ checkKey は js/skill-check.js の CHECKS 12 個から選ぶ (survival / nature は
       存在せず、書くと resolveSkillCheck が null を返して判定ごと静かに消える)。 */

  /* 1 停留所あたりの発生率。⭐ 遊んで動かすレバー (⛔ 受入条件は具体値を縛らない)。
     ⛔ **公開しない** —— world.html が確率を 1 つも知らない状態を保つ
       (#45 の「5% / 20% を world.html へ写さない」= 変異 alwaysfire と同じ規律)。 */
  var AMBUSH_RATE = 0.06;
  /* 種をずらす salt。⭐ rnd() と **同じ種から別の列**を作るための唯一の仕掛け。
     ⚠⚠ 加算で 0x6D2B79F5 を使ってはいけない —— mulberry32 の増分と同じ値なので
       ambRnd の列が rnd の列を **1 つずらしただけ**になる (相関した 2 本になる)。
       ⇒ **XOR** で混ぜる。
     ⭐ この値は「出る種 / 出ない種」の並びを決めるので、tools/verify_road_ambush.js の
       (0c) が SCAN_SEEDS の先頭 11 種で両方の腕を作れるかに直に効く
       (2026-09-04 実測 = 種 9 は 1 停留所目で出る / 種 7 は 12 回とも出ない)。 */
  var AMB_SALT = 0x51ED270B;
  var ambState = 0, ambSeed0 = 0, ambReady = false;
  function ambEnsure() {
    if (ambReady) return;
    ensureRnd();                 /* ⭐ 種の唯一の正は seedInfo。⛔ rndState は読むだけ */
    ambSeed0 = (seedInfo.seed ^ AMB_SALT) >>> 0;
    ambState = ambSeed0;
    ambReady = true;
  }
  /* mulberry32 (rnd と同じ式・**別の状態**)。⛔ ここで rndState を触らない。
     ⚠⚠⚠ **最後の 1 行を rnd() と同じ字面にしないこと。**
       tools/verify_road_events.js の変異 `seedignore` は
       `return ((t ^ (t >>> 14)) >>> 0) / 4294967296;` を**逐語**アンカーにしており、
       同じ行が 2 本あると起動時検算 (ちょうど 1 件ヒット) に落ちて **exit 3** になる
       (2026-09-04 に実際に踏んだ)。⇒ ここでは 2 行に割ってある。
     ⛔ 共通ヘルパへ畳んで rnd() 側の 1 行を消すのも不可 (今度は 0 件ヒットで同じく exit 3)。 */
  function ambRnd() {
    ambEnsure();
    ambState = (ambState + 0x6D2B79F5) >>> 0;
    var t = ambState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    var u = (t ^ (t >>> 14)) >>> 0;
    return u / 4294967296;
  }
  /* 1 停留所ぶん振る。⭐ 呼び手 (world.html) は確率を 1 つも知らない。 */
  function ambRoll() { return ambRnd() < AMBUSH_RATE; }
  /* 襲撃ストリームの初期種 (⛔ 可変状態ではない = 何度呼んでも同じ値)。記録用。 */
  function ambSeed() { ambEnsure(); return ambSeed0; }

  /* ★ 襲撃の盤面。⛔ **ここだけが座標とテーマの唯一の正**。world.html はこのオブジェクトを
       丸ごと roadBattle へ載せるだけで、座標も themeId も 1 つも知らない
       (#45 の「文言を world.html へ写さない」と同じ規律を、数値へ広げたもの)。
     ⚠ #52 (街道の卓上マップ) が**このオブジェクトを丸ごと差し替える**。
     ⚠ themeId を屋外テーマ (caravan-road) にできるのは「カスタム幾何を持たない今だけ」——
       js/df-mapdef.js の resolve() 規則④が屋外テーマ x カスタム幾何を禁じており
       (地平線レンダラが flags.bandMask ではなく themeId から引かれるため、mapDef で
        bandMask を切っても空と丘だけがカスタム幾何の上に残る)、卓上マップを載せる #52 では
       **非屋外テーマへ移す**必要がある。
     ⚠⚠ 座標は 7.9-3「隊商護衛」(tavern.html:8158-8180) の出荷値をそのまま使う。屋外テーマの
       歩行帯は row 13-15 の 3 行で、馬車は displaySize 240 = 3x3 タイルを占めるので
       中心は必ず ty:14 (ty:13 だと ty12 = 帯の外 = 壁を踏む)。
     ⚠⚠ 敵キーは index.html の ENEMY_TYPES 実在のものだけ
       (goblin / goblinArcher / hobgoblin / goblinRider)。未知キーは _safeSpawns の検疫で
       無言消去され、spawns が空になると **goblin-mine へフォールバック**して
       ゴブリン鉱山の敵が湧く化けバグになる。
     ⭐ waves は **1 件だけ** (ユーザー決定 = 1 波・短期決戦。⛔ 7.9-3 の 3 波にしない)。
     ⭐ trapCount / hiddenChestCount が 0 なので金貨の湧き口が無い ⇒ clearGold で払う
       (#51 §2-9。素通し口は項目 3 が index.html へ 1 本足す)。 */
  var AMBUSH_FIELD = {
    themeId: "caravan-road",
    wagonSpawns: [{ tx: 9, ty: 14 }],
    spawns: [["goblin", 14, 13], ["goblinArcher", 15, 13], ["goblin", 14, 14]],
    waves: [{ count: 3, pool: ["goblin", "goblinArcher"] }],
    trapCount: 0, hiddenChestCount: 0,
    clearXp: 250, clearGold: 80
  };

  var AMBUSH = {
    id: "road_caravan_ambush", checkKey: "perception", dc: "medium",
    title: "街道の襲撃",
    intro: "街道の先で悲鳴と車輪の軋みが上がった。荷を積んだ幌車が轍を外れて傾き、"
      + "その周りを小柄な影がいくつも跳ね回っている。護衛らしき男が槍を杖にして"
      + "ようやく立っているのが、木立の隙間から見えた。",
    choices: [
      {
        label: "茂みから回り込み、隙を突く", check: true,
        success: "斜面の茂みを伝って幌車の裏へ回り込む。影たちは荷の紐と格闘していて、"
          + "背後の草がひとつ揺れたことにも気づかない。こちらが先に踏み込んだ。",
        fail: "足元の枯枝が乾いた音を立てた。影がいっせいに振り向き、"
          + "幌車を放り出して駆けてくる。正面からぶつかるしかない。"
      },
      {
        label: "見つからぬよう街道を外れて通り過ぎる", check: false,
        result: "草いきれの中を身を低くして進み、幌車を大きく迂回する。"
          + "背中で悲鳴が細くなり、やがて風の音に紛れて聞こえなくなった。"
      }
    ]
  };

  // ══ party — 誰が判定するか (依頼書 §2-3 の罠 B) ════════════════════════════
  /* ⚠⚠⚠ **4 人分は sessionStorage / localStorage は主人公 1 人だけ。**
       tavern.html:6948 / :7034 が sessionStorage へ 4 人分を書き、
       title.html:737 / tavern.html:4973 が localStorage へ主人公 1 人だけを書く。
       localStorage を読むと「4 人で歩いているのに 1 人で判定する」嘘になる
       (変異 localparty が番人 = (2a) が判定パネルのロスターの行数で見る)。
     ⛔⛔⛔ **removeItem を絶対に呼ばない。** world.html の #23 規律 =
       「一回性のキーを 1 つも消さない。読むだけ = peek」。exitVia を消すと帰還先が、
       lastResult を消すと酒場のリザルト画面が黙って壊れる ((2c) が配信バイトの数で見る)。
     ⭐ name は window.HERO_CLASSES から引く (⛔ 職業名を写経しない)。 */
  var PARTY_KEY = "dragonfighters.partyComposition";
  var PARTY_FALLBACK = "warrior";           /* heroClassKey() の fail-safe と同じ倒し方 */
  function readKeys(raw) {
    var a = null;
    try { a = JSON.parse(raw || "[]"); } catch (e) { a = null; }
    if (!Array.isArray(a)) return [];
    return a.filter(function (k) { return typeof k === "string" && k.length > 0; });
  }
  function classNameOf(key) {
    var list = global.HERO_CLASSES || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].classKey === key) return list[i].name || key;
    }
    return key;
  }
  function buildParty() {
    var raw = null;
    try { raw = sessionStorage.getItem(PARTY_KEY); } catch (e) { raw = null; }   /* ① 4 人分 (peek のみ) */
    var keys = readKeys(raw);
    if (!keys.length) {
      try { raw = localStorage.getItem(PARTY_KEY); } catch (e) { raw = null; }   /* ② 主人公 1 人 */
      keys = readKeys(raw);
    }
    if (!keys.length) keys = [PARTY_FALLBACK];                                   /* ③ どちらも無い */
    return keys.map(function (k) { return { classKey: k, name: classNameOf(k) }; });
  }

  // ══ 結末の文 (依頼書 §6-3) ════════════════════════════════════════════════
  /* ⚠ SkillCheck.resolveSkillCheck は **null を返しうる** (未知の checkKey /
       代表者が選べない)。null のときは **失敗扱いにせず**、判定なしの結末へ倒す。
       ⛔ 黙って何も出さないのは禁止 (プレイヤーには器が開いたままに見える)。 */
  function noRollText(ev) {
    var cs = (ev && ev.choices) || [];
    for (var i = 0; i < cs.length; i++) if (!cs[i].check && cs[i].result) return cs[i].result;
    return "";
  }
  function resultText(ev, choice, outcome) {
    if (!choice) return noRollText(ev);
    if (!choice.check) return choice.result || noRollText(ev);
    if (!outcome) return noRollText(ev);
    return outcome.success ? choice.success : choice.fail;
  }

  // ══ 器 (#worldEventBox の描画) ═══════════════════════════════════════════
  /* ⭐⭐⭐ 描画を js/road-events.js 側に置く理由は 2 つ。
       ① (0b) が「world.html の配信バイトに 6 件の文言が 1 文字も出てこない」を要求する
       ② ドライバが器を **決定論的に開いて** (1c)(1d) を測れる
          (発火は項目 3 の担当なので、項目 2 の時点では開く手段が他に無い)
     world.html が持つのは **マウント先の DOM と CSS だけ**。
     ⛔ ?roadevent=0 のときは world.html 側が器ごと DOM から消す (項目 4)。
        そのとき open() は false を返して**黙って何もしない**のが正しい姿。 */
  var openEv = null;
  var armAt = 0;

  /* ⚠ #35 の実測: touchend → click のゴーストクリックで「開いた瞬間に選択肢が押される」。
     器を開いてからこの時間だけ、選択肢の活性化を無視する。
     ⚠⚠ 項目 3 のドライバが選択肢を押すときは、開いてからこの ms を待つこと。 */
  var ARM_MS = 260;

  function el() { return document.getElementById("worldEventBox"); }
  function isOpen() { var b = el(); return !!b && b.classList.contains("show"); }
  function current() { return openEv; }

  /* ══ 「携えた」の 1 行 (#47) ═══════════════════════════════════════════════
     ⭐ 文言を組むのは **ここだけ**。world.html は器 (#worldEventBoon) と CSS しか持たない
       ((0b) が world.html の配信バイトを全文検索して label の写経を落とす)。
     ⚠ 空のときは textContent を空にして **hidden も立てる** —— 片方だけだと
       枠線だけの空箱が残る / 前の結末の残骸が読める ((1e) が両方で見る)。
     ⛔ innerHTML を使わない (label は表由来だが、経路を作らないのが規律。#47 §2-3)。 */
  function boonLine(boon) {
    if (!boon || typeof boon.label !== "string" || !boon.label) return "";
    return "→ " + boon.label + " を携えた(この先の潜行で効く)";
  }
  function setBoonLine(text) {
    var b = el();
    var n = b ? b.querySelector("#worldEventBoon") : null;
    if (!n) return false;                     /* ⭐ 器が無くても壊れない (?roadevent=0 で消える) */
    var s = text || "";
    n.textContent = s;
    n.hidden = !s;
    return true;
  }

  function close() {
    var b = el();
    openEv = null;
    if (!b) return false;
    b.classList.remove("show");
    b.setAttribute("aria-hidden", "true");
    var n = b.querySelector("#worldEventBtns");
    if (n) n.innerHTML = "";
    setBoonLine("");   /* ⭐ #47: 閉じるときに「携えた」を消す (変異 boxleak が番人) */
    return true;
  }

  /* 見出し + 本文 + ボタン列を描いて開く。buttons = [{label, on}]。 */
  function paint(title, body, buttons) {
    var b = el();
    if (!b) return false;
    var t = b.querySelector("#worldEventTitle");
    var x = b.querySelector("#worldEventText");
    var n = b.querySelector("#worldEventBtns");
    if (!t || !x || !n) return false;
    t.textContent = title || "";
    x.textContent = body || "";
    n.innerHTML = "";
    setBoonLine("");   /* ⭐ #47: 器を描く共通口。前回の「携えた」を必ず消す (変異 boxleak) */
    for (var i = 0; i < buttons.length; i++) {
      n.appendChild(makeBtn(buttons[i]));
    }
    armAt = Date.now() + ARM_MS;
    b.classList.add("show");
    b.setAttribute("aria-hidden", "false");
    return true;
  }

  function makeBtn(spec) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "worldEventBtn";
    btn.textContent = spec.label;
    var used = false;
    function go(e) {
      if (Date.now() < armAt) return;          /* ゴーストクリック除け */
      if (used) return;                         /* touchend と click の二重発火除け */
      used = true;
      if (e && e.preventDefault) e.preventDefault();
      if (typeof spec.on === "function") spec.on();
    }
    btn.addEventListener("click", go);
    btn.addEventListener("touchend", go);
    return btn;
  }

  /* 導入 + 二択を出す。onChoice(choice, ev) が選ばれた選択肢を受け取る。
     ⛔ ここでは判定も結末も出さない (項目 3 が onChoice の中でやる)。 */
  function open(ev, onChoice) {
    if (!ev) return false;
    var list = (ev.choices || []).map(function (c) {
      return {
        label: c.label,
        on: function () { if (typeof onChoice === "function") onChoice(c, ev); }
      };
    });
    var ok = paint(ev.title, ev.intro, list);
    if (ok) openEv = ev;
    return ok;
  }

  /* 結末の 1 文 + 「先へ進む」。onDone は器を閉じたあとに呼ぶ。
     ⭐ 第 4 引数 boon (#47) = boonOf() が返した実り or null。⛔ 呼び手 (world.html) は
       文言を 1 文字も知らない —— 渡すのは {kind,label,event} だけで、組むのは boonLine()。
     ⚠ paint() が先に空へ倒すので、boon が無い結末では必ず hidden + 空になる ((1e))。 */
  function showResult(ev, text, onDone, boon) {
    var ok = paint((ev && ev.title) || "", text, [{
      label: "先へ進む",
      on: function () { close(); if (typeof onDone === "function") onDone(); }
    }]);
    if (ok) {
      openEv = ev || null;
      setBoonLine(boonLine(boon));
    }
    return ok;
  }

  global.ROAD_EVENTS = {
    /* データ (⛔ 唯一の正。world.html へ写さない) */
    EVENTS: EVENTS, TERRAINS: TERRAINS, RATE: RATE,
    WAY_TERRAIN: WAY_TERRAIN, SITE_TERRAIN: SITE_TERRAIN, TERRAIN_RANK: TERRAIN_RANK,
    /* 街道の実り (#47) — ⛔ 表と引きだけ。書く決定は world.html の finishRoadEvent */
    BOONS: BOONS, boonOf: boonOf,
    /* 引き */
    terrainOf: terrainOf, stops: stops, rateOf: rateOf,
    eventsFor: eventsFor, byId: byId,
    /* 種つき乱数 (⭐ 決定論のシーム。⛔ Math.random を発火判定で直接使わない) */
    rnd: rnd, seed: seed, seedFromUrl: seedFromUrl, roll: roll, pickEvent: pickEvent,
    /* 街道の襲撃 (#51) — ⛔ 公開するのはこの 4 つだけ。
       ⛔ AMBUSH_RATE と ambRnd は公開しない (world.html に確率も生の乱数も渡さない)。
       ⛔ AMBUSH を EVENTS へ混ぜない (罠 A)。 */
    AMBUSH: AMBUSH, AMBUSH_FIELD: AMBUSH_FIELD, ambRoll: ambRoll, ambSeed: ambSeed,
    /* party と結末の文 (⭐ 罠 B と null 結末の唯一の正) */
    buildParty: buildParty, resultText: resultText,
    /* 器 */
    open: open, showResult: showResult, close: close,
    isOpen: isOpen, current: current, el: el, ARM_MS: ARM_MS
  };
})(typeof window !== "undefined" ? window : this);
