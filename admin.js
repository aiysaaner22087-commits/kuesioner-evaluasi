const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;

let accessToken = null;
let latestRows = [];

let aggDomainChart = null;
let aggProcessChart = null;
let detailDomainChart = null;
let detailProcessChart = null;

function fmtDate(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a,b)=>a+b,0)/arr.length;
}

function round2(n){ return Math.round((safeNum(n) + 1e-12) * 100) / 100; }

function toCSV(rows) {
  const header = ["id","created_at","nama","jabatan","unit","tanggal","overall_level","apo_avg","dss_avg","mea_avg"];
  const esc = (v) => {
    const s = String(v ?? "");
    return (s.includes(",") || s.includes('"') || s.includes("\n")) ? `"${s.replace(/"/g,'""')}"` : s;
  };
  const lines = [header.join(",")];
  for (const r of rows) {
    const resp = r.respondent || {};
    const pd = r.results?.perDomain || {};
    lines.push([
      r.id, r.created_at,
      resp.nama, resp.jabatan, resp.unit, resp.tanggal,
      r.overall_level,
      pd.APO?.average ?? "",
      pd.DSS?.average ?? "",
      pd.MEA?.average ?? "",
    ].map(esc).join(","));
  }
  return lines.join("\n");
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
  document.getElementById("dataMsg").textContent = "Login berhasil. Silakan klik Refresh.";
}

async function loadData() {
  if (!accessToken) {
    document.getElementById("dataMsg").textContent = "Silakan login dulu.";
    return;
  }

  document.getElementById("dataMsg").textContent = "Memuat data...";

  // ambil lengkap supaya admin bisa agregasi + detail
  const url =
    `${SUPABASE_URL}/rest/v1/cobit_responses` +
    `?select=id,created_at,respondent,overall_level,results,answers` +
    `&order=created_at.desc&limit=500`;

  const res = await fetch(url, {
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${accessToken}`,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    document.getElementById("dataMsg").textContent = "Gagal ambil data: " + JSON.stringify(data);
    return;
  }

  latestRows = Array.isArray(data) ? data : [];
  document.getElementById("dataMsg").textContent = `Loaded: ${latestRows.length} responden`;

  renderStats();
  renderAggregateCharts();
  renderTable();
}

function renderStats() {
  document.getElementById("statCount").textContent = String(latestRows.length);

  const overalls = latestRows.map(r => safeNum(r.overall_level));
  document.getElementById("statOverall").textContent = String(round2(avg(overalls)));
}

function buildAggAverages() {
  // agregat dari results.perDomain & results.perProcess (yang sudah dihitung saat submit)
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

  const domainKeys = Object.keys(domainBuckets).sort(); // APO, DSS, MEA
  const domainAvg = domainKeys.map(k => round2(avg(domainBuckets[k])));

  const processKeys = Object.keys(processBuckets).sort(); // APO12, DSS01, ...
  const processAvg = processKeys.map(k => round2(avg(processBuckets[k])));

  return { domainKeys, domainAvg, processKeys, processAvg };
}

function renderAggregateCharts() {
  const { domainKeys, domainAvg, processKeys, processAvg } = buildAggAverages();
  const Chart = window.Chart;

  // domain chart
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

  // process chart
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
    if (!q) return true;
    return nama.includes(q) || jabatan.includes(q);
  });

  for (const r of filtered) {
    const resp = r.respondent || {};
    const pd = r.results?.perDomain || {};
    const tr = document.createElement("tr");
    tr.className = "border-t hover:bg-gray-50 cursor-pointer";

    tr.innerHTML = `
      <td class="p-3 whitespace-nowrap">${fmtDate(r.created_at)}</td>
      <td class="p-3">${resp.nama ?? "-"}</td>
      <td class="p-3">${resp.jabatan ?? "-"}</td>
      <td class="p-3 font-semibold">${r.overall_level ?? "-"}</td>
      <td class="p-3">${pd.APO?.average ?? "-"}</td>
      <td class="p-3">${pd.DSS?.average ?? "-"}</td>
      <td class="p-3">${pd.MEA?.average ?? "-"}</td>
    `;

    tr.addEventListener("click", () => showDetail(r));
    tbody.appendChild(tr);
  }
}

function showDetail(row) {
  const resp = row.respondent || {};
  const pd = row.results?.perDomain || {};
  const pp = row.results?.perProcess || {};

  document.getElementById("detailMeta").innerHTML =
    `<b>${resp.nama ?? "-"}</b> • ${resp.jabatan ?? "-"} • overall: <b>${row.overall_level ?? "-"}</b> • ${fmtDate(row.created_at)}`;

  document.getElementById("detailAnswers").textContent = JSON.stringify(row.answers || {}, null, 2);

  const dKeys = Object.keys(pd);
  const dVals = dKeys.map(k => safeNum(pd[k]?.average));

  const pKeys = Object.keys(pp).sort();
  const pVals = pKeys.map(k => safeNum(pp[k]?.average));

  const Chart = window.Chart;

  if (!detailDomainChart) {
    detailDomainChart = Chart.new(document.getElementById("detailDomainChart"), {
      type: "bar",
      data: { labels: dKeys, datasets: [{ label: "Maturity (0–5)", data: dVals }] },
      options: { scales: { y: { min: 0, max: 5, ticks: { stepSize: 1 } } } }
    });
  } else {
    detailDomainChart.data.labels = dKeys;
    detailDomainChart.data.datasets[0].data = dVals;
    detailDomainChart.update();
  }

  if (!detailProcessChart) {
    detailProcessChart = Chart.new(document.getElementById("detailProcessChart"), {
      type: "bar",
      data: { labels: pKeys, datasets: [{ label: "Maturity (0–5)", data: pVals }] },
      options: { scales: { y: { min: 0, max: 5, ticks: { stepSize: 1 } } } }
    });
  } else {
    detailProcessChart.data.labels = pKeys;
    detailProcessChart.data.datasets[0].data = pVals;
    detailProcessChart.update();
  }
}

function clearDetail() {
  document.getElementById("detailMeta").textContent = "Pilih responden dari tabel untuk melihat detail.";
  document.getElementById("detailAnswers").textContent = "-";
  if (detailDomainChart) { detailDomainChart.destroy(); detailDomainChart = null; }
  if (detailProcessChart) { detailProcessChart.destroy(); detailProcessChart = null; }
}

function exportCSV() {
  if (!latestRows.length) {
    document.getElementById("dataMsg").textContent = "Tidak ada data untuk diexport.";
    return;
  }
  const csv = toCSV(latestRows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cobit_pospay_responses.csv";
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
  clearDetail();
}

document.getElementById("btnLogin").addEventListener("click", login);
document.getElementById("btnRefresh").addEventListener("click", loadData);
document.getElementById("btnCSV").addEventListener("click", exportCSV);
document.getElementById("btnLogout").addEventListener("click", logout);
document.getElementById("btnClearDetail").addEventListener("click", clearDetail);
document.getElementById("search").addEventListener("input", renderTable);
