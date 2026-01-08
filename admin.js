const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;

let accessToken = null;
let latestRows = [];
let selectedRow = null;

let levelChart = null;
let aggDomainChart = null;
let aggProcessChart = null;
let detailDomainChart = null;
let detailProcessChart = null;

function fmtDate(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}
function safeNum(x) { const n = Number(x); return Number.isFinite(n) ? n : 0; }
function round2(n) { return Math.round((safeNum(n) + 1e-12) * 100) / 100; }

function median(arr) {
  const a = arr.filter(Number.isFinite).slice().sort((x,y)=>x-y);
  if (!a.length) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid-1] + a[mid]) / 2;
}

function levelBucket(overall) {
  const x = safeNum(overall);
  if (x < 0.5) return 0;
  if (x < 1.5) return 1;
  if (x < 2.5) return 2;
  if (x < 3.5) return 3;
  if (x < 4.5) return 4;
  return 5;
}
function levelText(level) {
  return [
    "Level 0 (Incomplete)",
    "Level 1 (Performed)",
    "Level 2 (Managed)",
    "Level 3 (Established)",
    "Level 4 (Predictable)",
    "Level 5 (Optimizing)",
  ][level] || "-";
}

async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  document.getElementById("loginMsg").textContent = "Memproses login...";

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();
  if (!res.ok) {
    document.getElementById("loginMsg").textContent = "Login gagal: " + JSON.stringify(data);
    accessToken = null;
    return;
  }

  accessToken = data.access_token;
  document.getElementById("loginMsg").textContent = "Login berhasil.";
  document.getElementById("dataMsg").textContent = "Login berhasil. Klik Refresh.";
}

async function loadData() {
  if (!accessToken) {
    document.getElementById("dataMsg").textContent = "Silakan login dulu.";
    return;
  }

  document.getElementById("dataMsg").textContent = "Memuat data...";

  const url =
    `${SUPABASE_URL}/rest/v1/cobit_responses` +
    `?select=id,created_at,respondent,overall_level,results,answers` +
    `&order=created_at.desc&limit=500`;

  const res = await fetch(url, {
    headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${accessToken}` },
  });

  const data = await res.json();
  if (!res.ok) {
    document.getElementById("dataMsg").textContent = "Gagal ambil data: " + JSON.stringify(data);
    return;
  }

  latestRows = Array.isArray(data) ? data : [];
  document.getElementById("dataMsg").textContent = `Loaded: ${latestRows.length} responden`;

  renderStats();
  renderSummaryCharts();
  renderTable();
  // jangan hapus detail kalau masih ada row yang sama id-nya
  if (selectedRow) {
    const still = latestRows.find(r => r.id === selectedRow.id);
    if (still) showDetail(still, { keepSelection: true });
    else clearDetail();
  }
}

function renderStats() {
  document.getElementById("statCount").textContent = String(latestRows.length);

  const overalls = latestRows.map(r => safeNum(r.overall_level));
  const avgOverall = overalls.length ? overalls.reduce((a,b)=>a+b,0)/overalls.length : 0;

  document.getElementById("statOverall").textContent = String(round2(avgOverall));
  document.getElementById("statMedian").textContent = String(round2(median(overalls)));
}

function buildAggAverages() {
  const domainBuckets = {};   // {APO:[..], DSS:[..], MEA:[..]}
  const processBuckets = {};  // {APO12:[..], DSS01:[..] ...}

  for (const r of latestRows) {
    const perDomain = r.results?.perDomain || {};
    const perProcess = r.results?.perProcess || {};

    for (const [dk, dv] of Object.entries(perDomain)) {
      domainBuckets[dk] = domainBuckets[dk] || [];
      domainBuckets[dk].push(safeNum(dv?.average));
    }

    for (const [pk, pv] of Object.entries(perProcess)) {
      processBuckets[pk] = processBuckets[pk] || [];
      processBuckets[pk].push(safeNum(pv?.average));
    }
  }

  const domainKeys = Object.keys(domainBuckets).sort();
  const domainAvg = domainKeys.map(k => round2(domainBuckets[k].reduce((a,b)=>a+b,0)/domainBuckets[k].length));

  const processKeys = Object.keys(processBuckets).sort();
  const processAvg = processKeys.map(k => round2(processBuckets[k].reduce((a,b)=>a+b,0)/processBuckets[k].length));

  return { domainKeys, domainAvg, processKeys, processAvg };
}

function buildLevelDistribution() {
  const buckets = [0,0,0,0,0,0];
  for (const r of latestRows) buckets[levelBucket(r.overall_level)]++;
  return buckets;
}

function renderSummaryCharts() {
  const Chart = window.Chart;

  // level distribution
  const dist = buildLevelDistribution();
  const labels = ["0","1","2","3","4","5"];
  if (!levelChart) {
    levelChart = Chart.new(document.getElementById("levelChart"), {
      type: "bar",
      data: { labels, datasets: [{ label: "Jumlah Responden", data: dist }] },
      options: { scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
  } else {
    levelChart.data.labels = labels;
    levelChart.data.datasets[0].data = dist;
    levelChart.update();
  }

  // aggregate domain + process
  const { domainKeys, domainAvg, processKeys, processAvg } = buildAggAverages();

  if (!aggDomainChart) {
    aggDomainChart = Chart.new(document.getElementById("aggDomainChart"), {
      type: "bar",
      data: { labels: domainKeys, datasets: [{ label: "Rata-rata Maturity (0–5)", data: domainAvg }] },
      options: { scales: { y: { min: 0, max: 5, ticks: { stepSize: 1 } } } }
    });
  } else {
    aggDomainChart.data.labels = domainKeys;
    aggDomainChart.data.datasets[0].data = domainAvg;
    aggDomainChart.update();
  }

  if (!aggProcessChart) {
    aggProcessChart = Chart.new(document.getElementById("aggProcessChart"), {
      type: "bar",
      data: { labels: processKeys, datasets: [{ label: "Rata-rata Maturity (0–5)", data: processAvg }] },
      options: { scales: { y: { min: 0, max: 5, ticks: { stepSize: 1 } } } }
    });
  } else {
    aggProcessChart.data.labels = processKeys;
    aggProcessChart.data.datasets[0].data = processAvg;
    aggProcessChart.update();
  }
}

function renderTable() {
  const tbody = document.getElementById("tbody");
  tbody.innerHTML = "";

  const q = (document.getElementById("search").value || "").toLowerCase().trim();

  const filtered = latestRows.filter(r => {
    const resp = r.respondent || {};
    const nama = String(resp.nama || "").toLowerCase();
    const jabatan = String(resp.jabatan || "").toLowerCase();
    const unit = String(resp.unit || "").toLowerCase();
    if (!q) return true;
    return nama.includes(q) || jabatan.includes(q) || unit.includes(q);
  });

  for (const r of filtered) {
    const resp = r.respondent || {};
    const pd = r.results?.perDomain || {};
    const level = levelBucket(r.overall_level);

    const tr = document.createElement("tr");
    tr.className = "border-t hover:bg-gray-50 cursor-pointer";
    tr.innerHTML = `
      <td class="p-3 whitespace-nowrap">${fmtDate(r.created_at)}</td>
      <td class="p-3">${resp.nama ?? "-"}</td>
      <td class="p-3">${resp.jabatan ?? "-"}</td>
      <td class="p-3">${resp.unit ?? "-"}</td>
      <td class="p-3 font-semibold">${r.overall_level ?? "-"}</td>
      <td class="p-3">${level}</td>
      <td class="p-3">${pd.APO?.average ?? "-"}</td>
      <td class="p-3">${pd.DSS?.average ?? "-"}</td>
      <td class="p-3">${pd.MEA?.average ?? "-"}</td>
    `;
    tr.addEventListener("click", () => showDetail(r));
    tbody.appendChild(tr);
  }
}

function showDetail(row, opts = {}) {
  selectedRow = row;

  // enable actions
  document.getElementById("btnSaveEdit").disabled = false;
  document.getElementById("btnDelete").disabled = false;

  const resp = row.respondent || {};
  const pd = row.results?.perDomain || {};
  const pp = row.results?.perProcess || {};
  const level = levelBucket(row.overall_level);

  document.getElementById("detailMeta").innerHTML =
    `<b>${resp.nama ?? "-"}</b> • ${resp.jabatan ?? "-"} • ${fmtDate(row.created_at)} • ID: <b>${row.id}</b>`;

  document.getElementById("detailOverall").textContent = String(row.overall_level ?? "-");
  document.getElementById("detailLevelText").textContent = levelText(level);

  document.getElementById("detailDomainNums").textContent =
    `APO: ${pd.APO?.average ?? "-"} • DSS: ${pd.DSS?.average ?? "-"} • MEA: ${pd.MEA?.average ?? "-"}`;

  document.getElementById("detailIdentity").innerHTML = `
    <div><b>Nama:</b> ${resp.nama ?? "-"}</div>
    <div><b>Jabatan:</b> ${resp.jabatan ?? "-"}</div>
    <div><b>Unit:</b> ${resp.unit ?? "-"}</div>
    <div><b>Tanggal:</b> ${resp.tanggal ?? "-"}</div>
  `;

  document.getElementById("detailAnswers").textContent = JSON.stringify(row.answers || {}, null, 2);

  // fill edit form
  document.getElementById("editNama").value = resp.nama ?? "";
  document.getElementById("editJabatan").value = resp.jabatan ?? "";
  document.getElementById("editUnit").value = resp.unit ?? "";
  document.getElementById("editTanggal").value = resp.tanggal ?? "";

  // charts for selected respondent
  const dKeys = Object.keys(pd);
  const dVals = dKeys.map(k => safeNum(pd[k]?.average));

  const pKeys = Object.keys(pp).sort();
  const pVals = pKeys.map(k => safeNum(pp[k]?.average));

  const Chart = window.Chart;

  if (detailDomainChart) { detailDomainChart.destroy(); detailDomainChart = null; }
  if (detailProcessChart) { detailProcessChart.destroy(); detailProcessChart = null; }

  detailDomainChart = Chart.new(document.getElementById("detailDomainChart"), {
    type: "bar",
    data: { labels: dKeys, datasets: [{ label: "Maturity (0–5)", data: dVals }] },
    options: { scales: { y: { min: 0, max: 5, ticks: { stepSize: 1 } } } }
  });

  detailProcessChart = Chart.new(document.getElementById("detailProcessChart"), {
    type: "bar",
    data: { labels: pKeys, datasets: [{ label: "Maturity (0–5)", data: pVals }] },
    options: { scales: { y: { min: 0, max: 5, ticks: { stepSize: 1 } } } }
  });

  if (!opts.keepSelection) document.getElementById("editMsg").textContent = "";
}

function clearDetail() {
  selectedRow = null;
  document.getElementById("detailMeta").textContent = "Pilih responden dari tabel untuk melihat detail.";
  document.getElementById("detailOverall").textContent = "-";
  document.getElementById("detailLevelText").textContent = "-";
  document.getElementById("detailDomainNums").textContent = "-";
  document.getElementById("detailIdentity").textContent = "-";
  document.getElementById("detailAnswers").textContent = "-";
  document.getElementById("editNama").value = "";
  document.getElementById("editJabatan").value = "";
  document.getElementById("editUnit").value = "";
  document.getElementById("editTanggal").value = "";
  document.getElementById("editMsg").textContent = "";

  document.getElementById("btnSaveEdit").disabled = true;
  document.getElementById("btnDelete").disabled = true;

  if (detailDomainChart) { detailDomainChart.destroy(); detailDomainChart = null; }
  if (detailProcessChart) { detailProcessChart.destroy(); detailProcessChart = null; }
}

async function saveEdit() {
  if (!accessToken) return;
  if (!selectedRow) return;

  const nama = document.getElementById("editNama").value.trim();
  const jabatan = document.getElementById("editJabatan").value.trim();
  const unit = document.getElementById("editUnit").value.trim();
  const tanggal = document.getElementById("editTanggal").value;

  if (!nama || !jabatan) {
    document.getElementById("editMsg").textContent = "Nama & jabatan wajib.";
    return;
  }

  document.getElementById("btnSaveEdit").disabled = true;
  document.getElementById("editMsg").textContent = "Menyimpan perubahan...";

  const patchUrl = `${SUPABASE_URL}/rest/v1/cobit_responses?id=eq.${selectedRow.id}`;

  const payload = {
    respondent: { nama, jabatan, unit, tanggal }
  };

  const res = await fetch(patchUrl, {
    method: "PATCH",
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: JSON.stringify(payload),
  });

  const txt = await res.text();
  document.getElementById("btnSaveEdit").disabled = false;

  if (!res.ok) {
    document.getElementById("editMsg").textContent = "Gagal: " + txt;
    return;
  }

  document.getElementById("editMsg").textContent = "Berhasil diupdate.";
  await loadData();
}

async function deleteRow() {
  if (!accessToken) return;
  if (!selectedRow) return;

  const ok = confirm(`Yakin hapus data responden "${selectedRow.respondent?.nama ?? "-"}" (ID ${selectedRow.id})?`);
  if (!ok) return;

  document.getElementById("dataMsg").textContent = "Menghapus data...";

  const delUrl = `${SUPABASE_URL}/rest/v1/cobit_responses?id=eq.${selectedRow.id}`;
  const res = await fetch(delUrl, {
    method: "DELETE",
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${accessToken}`,
    },
  });

  const txt = await res.text();
  if (!res.ok) {
    document.getElementById("dataMsg").textContent = "Gagal hapus: " + txt;
    return;
  }

  document.getElementById("dataMsg").textContent = "Data berhasil dihapus.";
  clearDetail();
  await loadData();
}

function exportCSVSummary() {
  if (!latestRows.length) { document.getElementById("dataMsg").textContent = "Tidak ada data."; return; }

  const header = ["id","created_at","nama","jabatan","unit","tanggal","overall_level","level","apo_avg","dss_avg","mea_avg"];
  const esc = (v) => {
    const s = String(v ?? "");
    return (s.includes(",") || s.includes('"') || s.includes("\n")) ? `"${s.replace(/"/g,'""')}"` : s;
  };

  const lines = [header.join(",")];
  for (const r of latestRows) {
    const resp = r.respondent || {};
    const pd = r.results?.perDomain || {};
    lines.push([
      r.id, r.created_at,
      resp.nama, resp.jabatan, resp.unit, resp.tanggal,
      r.overall_level,
      levelBucket(r.overall_level),
      pd.APO?.average ?? "",
      pd.DSS?.average ?? "",
      pd.MEA?.average ?? "",
    ].map(esc).join(","));
  }

  downloadCSV(lines.join("\n"), "cobit_pospay_responses_summary.csv");
}

function exportCSVDetail() {
  if (!latestRows.length) { document.getElementById("dataMsg").textContent = "Tidak ada data."; return; }

  // kunci kolom proses/domain yang konsisten
  const domainKeys = ["APO","DSS","MEA"];
  const processKeys = ["APO12","DSS01","DSS02","DSS03","MEA01"];

  const header = [
    "id","created_at",
    "nama","jabatan","unit","tanggal",
    "overall_level","level",
    ...domainKeys.map(d => `${d}_avg`),
    ...processKeys.map(p => `${p}_avg`),
    "answers_json"
  ];

  const esc = (v) => {
    const s = String(v ?? "");
    return (s.includes(",") || s.includes('"') || s.includes("\n")) ? `"${s.replace(/"/g,'""')}"` : s;
  };

  const lines = [header.join(",")];

  for (const r of latestRows) {
    const resp = r.respondent || {};
    const pd = r.results?.perDomain || {};
    const pp = r.results?.perProcess || {};
    const answersStr = JSON.stringify(r.answers || {});

    const row = [
      r.id, r.created_at,
      resp.nama, resp.jabatan, resp.unit, resp.tanggal,
      r.overall_level,
      levelBucket(r.overall_level),
      ...domainKeys.map(d => pd[d]?.average ?? ""),
      ...processKeys.map(p => pp[p]?.average ?? ""),
      answersStr
    ];

    lines.push(row.map(esc).join(","));
  }

  downloadCSV(lines.join("\n"), "cobit_pospay_responses_detail.csv");
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function logout() {
  accessToken = null;
  latestRows = [];
  document.getElementById("tbody").innerHTML = "";
  document.getElementById("dataMsg").textContent = "Logout.";
  document.getElementById("statCount").textContent = "0";
  document.getElementById("statOverall").textContent = "0.00";
  document.getElementById("statMedian").textContent = "0.00";
  clearDetail();

  // reset charts (optional)
  if (levelChart) { levelChart.destroy(); levelChart = null; }
  if (aggDomainChart) { aggDomainChart.destroy(); aggDomainChart = null; }
  if (aggProcessChart) { aggProcessChart.destroy(); aggProcessChart = null; }
}

document.getElementById("btnLogin").addEventListener("click", login);
document.getElementById("btnRefresh").addEventListener("click", loadData);
document.getElementById("btnCSVSummary").addEventListener("click", exportCSVSummary);
document.getElementById("btnCSVDetail").addEventListener("click", exportCSVDetail);
document.getElementById("btnLogout").addEventListener("click", logout);

document.getElementById("btnClearDetail").addEventListener("click", clearDetail);
document.getElementById("btnSaveEdit").addEventListener("click", saveEdit);
document.getElementById("btnDelete").addEventListener("click", deleteRow);

document.getElementById("search").addEventListener("input", renderTable);
