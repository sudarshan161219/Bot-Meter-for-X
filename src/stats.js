// Pure helpers for turning an X user record into posting-frequency stats.
// Kept free of DOM/chrome APIs so they can be tested in Node.
(() => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  // X doesn't send join dates with posts, only with profiles, so we usually
  // derive it from the account's numeric ID:
  //  - Since ~April 2016, user IDs are Snowflake IDs with the creation time in
  //    the top bits, so the date is exact.
  //  - Older IDs were sequential; we interpolate between known accounts
  //    ([id, created unix seconds], read from x.com profiles in Sept 2026).
  //    Accurate to within a few months.
  const SNOWFLAKE_MIN = 10n ** 15n;
  const SNOWFLAKE_EPOCH = 1288834974657n;
  const SEQUENTIAL_ANCHORS = [
    [12, 1142974214], [13, 1142974303], [428333, 1167702494], [807095, 1172868102],
    [813286, 1173132505], [939091, 1173635484], [5162861, 1176936195], [5402612, 1177252957],
    [5436372, 1177342698], [10228272, 1194990226], [10671602, 1196203040], [11348282, 1198095632],
    [12266442, 1200398363], [13298072, 1202605952], [14130366, 1205301113], [14230524, 1206571068],
    [14740219, 1210564928], [15573174, 1216850234], [15576884, 1216870754], [16409683, 1222116455],
    [16573941, 1223007377], [17919972, 1228558254], [18839785, 1231607936], [19397785, 1232723914],
    [20106852, 1233790664], [20322929, 1234029574], [20536157, 1234293279], [22203756, 1235775891],
    [23083404, 1236356753], [24578794, 1237148403], [24742040, 1237228252], [25073877, 1237383998],
    [27195114, 1238224666], [27260086, 1238258482], [32766692, 1240026035], [34743251, 1240523610],
    [40148479, 1242352875], [44196397, 1243973549], [45055696, 1244253041], [50393960, 1245869050],
    [61559439, 1248978314], [79293791, 1254519453], [79923701, 1254718747], [85603854, 1256660691],
    [100220864, 1262092024], [105119490, 1263557664], [119509520, 1267652354], [138203134, 1272494320],
    [155659213, 1276542560], [169686021, 1279839605], [176566242, 1281390850], [176816252, 1281450513],
    [180505807, 1282248671], [181561712, 1282486746], [209708391, 1288379125], [240454812, 1295481180],
    [255388236, 1298274345], [264107729, 1299838726], [281217033, 1302644011], [309366491, 1306972866],
    [335141638, 1310625176], [355307031, 1313382608], [357312062, 1313643968], [376502929, 1316478944],
    [379408088, 1316903381], [380749300, 1317099723], [471672239, 1327292068], [486470758, 1328695495],
    [739784130, 1344224800], [866953267, 1349643196], [913812620, 1351568167], [1305940272, 1364341446],
    [1339835893, 1365530675], [1636590253, 1375310485], [2150327072, 1382507473], [2312333412, 1390763725],
    [2839430431, 1412373857], [2847028078, 1414430980], [2863488598, 1415255608], [2916305152, 1418333068],
    [3065618342, 1425690019], [3303293865, 1432948098], [3320478908, 1440007174], [4398626122, 1449442269],
    [4709822887, 1451930206], [4724959268, 1452196784],
  ];

  function joinDateFromId(restId) {
    if (typeof restId !== 'string' || !/^\d{1,20}$/.test(restId)) return null;
    const big = BigInt(restId);
    if (big >= SNOWFLAKE_MIN) return { ms: Number((big >> 22n) + SNOWFLAKE_EPOCH), approx: false };
    const id = Number(big);
    const a = SEQUENTIAL_ANCHORS;
    let i = 1;
    while (i < a.length - 1 && id > a[i][0]) i++;
    const [x0, y0] = a[i - 1];
    const [x1, y1] = a[i];
    const secs = y0 + ((y1 - y0) * (id - x0)) / (x1 - x0);
    return { ms: Math.round(Math.max(secs, a[0][1]) * 1000), approx: true };
  }

  function computeStats(user, settings, now = Date.now()) {
    let created = user.createdAt ? Date.parse(user.createdAt) : NaN;
    let approx = false;
    if (!Number.isFinite(created)) {
      const fromId = joinDateFromId(user.restId);
      if (!fromId) return null;
      created = fromId.ms;
      approx = fromId.approx;
    }
    const ageDays = Math.max((now - created) / DAY_MS, 0);
    // Treat anything younger than a day as one day so brand-new accounts don't divide by ~0.
    const rate = user.statuses / Math.max(ageDays, 1);
    let level = 'ok';
    if (rate >= settings.botRate) level = 'bot';
    else if (rate >= settings.warnRate) level = 'warn';
    return { rate, ageDays, created, approx, level };
  }

  function formatRate(rate) {
    if (rate < 10) return rate.toFixed(1);
    return Math.round(rate).toLocaleString('en-US');
  }

  function formatAge(days) {
    if (days < 1) return 'less than a day';
    if (days < 60) return `${Math.floor(days)} day${Math.floor(days) === 1 ? '' : 's'}`;
    if (days < 730) return `${Math.floor(days / 30.44)} months`;
    return `${(days / 365.25).toFixed(1)} years`;
  }

  const num = (n) => (n == null ? '?' : n.toLocaleString('en-US'));

  function describe(user, stats) {
    const joined = new Date(stats.created).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      ...(!stats.approx && { day: 'numeric' }),
    });
    const lines = [
      `@${user.screenName}: ≈ ${formatRate(stats.rate)} posts/day`,
      `${num(user.statuses)} posts over ${formatAge(stats.ageDays)} (joined ${stats.approx ? '≈ ' : ''}${joined})`,
    ];
    if (user.followers != null || user.following != null) {
      lines.push(`${num(user.followers)} followers · ${num(user.following)} following`);
    }
    if (user.media != null) lines.push(`${num(user.media)} media posts`);
    if (stats.level === 'bot') lines.push('Very high posting rate: likely automated');
    else if (stats.level === 'warn') lines.push('High posting rate');
    lines.push('(Post count includes replies and reposts)');
    return lines.join('\n');
  }

  globalThis.BotMeterStats = { computeStats, joinDateFromId, formatRate, formatAge, describe };
})();
